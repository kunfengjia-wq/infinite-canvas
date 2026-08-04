/**
 * 提示词工作台 AI 服务 - 内置 Skills
 * 按平台定制 system prompt，将画面描述转化为平台专属高质量提示词
 */
import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";
import type { AiConfig } from "@/stores/use-config-store";
import type { PromptGenerateRequest, PromptPlatform } from "@/types/prompt-studio";
import { PLATFORM_LIST, STYLE_PRESETS } from "@/types/prompt-studio";
import { supabase } from "@/services/db/supabase-client";
import { getSkillPrompt } from "@/services/db/skills-repo";
import { recordGeneration } from "@/services/db/history-repo";
import { TtlCache } from "@/services/ai-utils";
import { getPositiveExamples, getNegativeExamples } from "@/services/db/feedback-repo";

// ─── Few-shot 示例（从 Supabase 数据集获取）─────────────────────

/** 将提示词平台映射到数据集 platform 标识 */
function mapPlatformToDataset(platform: PromptPlatform): string {
    // 直连各平台专属数据集（seed-datasets-v2.mjs / seed-prompt-examples.mjs 已灌入专属示例），
    // 避免不同平台共用同一桶示例导致输出同质化（如 Seedance 误用 Runway 电影示例）。
    const map: Record<string, string> = {
        midjourney: "midjourney",
        "stable-diffusion": "sd",
        comfyui: "sd",
        flux: "flux",
        leonardo: "leonardo",
        "dall-e": "dall-e",
        "gpt-image": "gpt-image",
        ideogram: "ideogram",
        wanx: "wanx",
        kling: "kling",
        hailuo: "hailuo",
        vidu: "vidu",
        runway: "runway",
        pika: "pika",
        sora: "sora",
        veo: "veo",
        luma: "luma",
        seedance: "seedance",
        grok: "grok",
    };
    return map[platform] || "general";
}

/** 缓存已获取的示例（30分钟 TTL + sessionStorage 跨刷新保留） */
const fewShotCache = new TtlCache("fewshot:prompt");

async function getFewShotExamples(platform: PromptPlatform): Promise<string> {
    const datasetPlatform = mapPlatformToDataset(platform);
    const cached = fewShotCache.get(datasetPlatform);
    if (cached !== undefined) return cached;

    try {
        const { data } = await supabase
            .from("dataset_items")
            .select("title, prompt, negative_prompt")
            .eq("platform", datasetPlatform)
            .order("quality_score", { ascending: false })
            .limit(3);

        if (!data || data.length === 0) {
            fewShotCache.set(datasetPlatform, "");
            return "";
        }

        const examples = data
            .map((item: { title: string; prompt: string; negative_prompt?: string }, i: number) => {
                let text = `示例${i + 1}（${item.title}）：\n${item.prompt}`;
                if (item.negative_prompt) text += `\nNegative: ${item.negative_prompt}`;
                return text;
            })
            .join("\n\n");

        const result = `\n\n以下是高质量参考示例，请模仿其风格和结构：\n\n${examples}`;
        fewShotCache.set(datasetPlatform, result);
        return result;
    } catch {
        fewShotCache.set(datasetPlatform, "");
        return "";
    }
}

// ─── 后端状态查询（供 UI 展示当前生成配置）─────────────────────

/** 用户反馈注入：正面示例 + 负面规避（优先级高于数据集 few-shot） */
async function getFeedbackInjection(platform: PromptPlatform): Promise<string> {
    try {
        const [positives, negatives] = await Promise.all([
            getPositiveExamples(platform, 2),
            getNegativeExamples(platform, 3),
        ]);

        let injection = "";

        if (positives.length > 0) {
            const lines = positives.map((p, i) => `正面${i + 1}：${p.prompt}`).join("\n");
            injection += `\n\n【用户认可的高质量示例（仅供参考风格和结构，不要照搬，保持多样性）】\n${lines}`;
        }

        if (negatives.length > 0) {
            const lines = negatives.map((p, i) => `劣质${i + 1}：${p.prompt}`).join("\n");
            injection += `\n\n【用户不太满意的示例（参考其问题方向，尝试不同的表达组合）】\n${lines}`;
        }

        if (injection) {
            injection += `\n\n【反馈使用说明】以上用户反馈仅作参考，核心仍遵循平台规则和通用铁律。避免与正面示例过度相似导致同质化。`;
        }

        return injection;
    } catch {
        return "";
    }
}

// ─── 后端状态查询（供 UI 展示当前生成配置）─────────────────────

/** 查询某平台当前使用的 skill 来源：远程（Supabase）或本地内置 */
export async function getSkillSource(platform: PromptPlatform): Promise<"remote" | "local"> {
    const skillId = `pt_${platform.replace(/-/g, "_")}`;
    const remote = await getSkillPrompt(skillId);
    return remote ? "remote" : "local";
}

/** 查询某平台 few-shot 示例的数据集归属与是否命中 */
export async function getFewShotStatus(platform: PromptPlatform): Promise<{ dataset: string; available: boolean }> {
    const dataset = mapPlatformToDataset(platform);
    try {
        const { count } = await supabase.from("dataset_items").select("*", { count: "exact", head: true }).eq("platform", dataset);
        return { dataset, available: (count ?? 0) > 0 };
    } catch {
        return { dataset, available: false };
    }
}

// ─── 平台专属 System Prompts ─────────────────────────────────────

const PLATFORM_SKILLS: Record<PromptPlatform, string> = {
    midjourney: `你是 Midjourney v6.1 提示词专家。将用户描述转化为高质量提示词。

核心语法：
1. 使用自然语言英文描述，像一段画面说明，不用逗号堆标签
2. 多提示词语法：用 :: 分隔并加权，如 cinematic portrait::2 of a warrior::1.5 in rain::1
3. 结构：主体 → 环境 → 光线 → 风格 → 参数

v6.1 专属参数：
4. --style raw：降低默认美学，获得更贴近提示词的原生效果（写实/摄影必加）
5. --s {0-1000}：风格化强度，默认100；写实用0-50，艺术风格用200-500，超现实用600+
6. --c {0-100}：chaos 值，控制输出多样性，默认0；需要创意变化时设20-50
7. --w {0-3000}：weird 值，增加不寻常/怪诞美学，默认0
8. --no {关键词}：排除不想要的元素，如 --no text,watermark,blurry
9. --sref {URL或代码}：风格参考，锁定特定视觉风格
10. --oref {URL}：角色/对象参考，保持主体一致性
11. --cw {0-100}：角色参考权重，控制参考图影响程度，默认100
12. --personalize / --p：启用个性化，基于用户审美偏好调整

输出格式：
13. 末尾附加参数：--ar {比例} --v 6.1 --style raw --s {值} --no {排除项}
14. 输出纯提示词文本，不要解释

常见错误规避：
15. 不要在自然语言中插入逗号分隔标签（那是 SD 语法）
16. --style raw 与高 --s 值矛盾，写实场景用 --style raw --s 0-50
17. 多提示词 :: 权重不要超过5，否则画面失衡`,

    "stable-diffusion": `你是 Stable Diffusion 提示词专家，精通 SD 1.5/SDXL/SD3 全系列。将用户描述转化为高质量提示词。

提示词语法：
1. 使用逗号分隔的英文标签
2. 权重语法：(tag:1.2) 增加权重，(((tag))) 等价于 (tag:1.3)，[tag] 等价于 (tag:0.7) 降低权重
3. AND 语法：用 AND 分隔不同区域/概念，如 girl with red hair AND cat sitting on table（SD 分别编码两侧）
4. ALTernating 语法：用 [tag1|tag2] 让模型在每步交替使用不同标签，增加多样性
5. BREAK 语法：用 BREAK 强制分隔 token 段落，避免超长提示词被截断

SDXL/SD3 特性：
6. SDXL 对自然语言理解更强，可混合短句描述（如 "a beautiful sunset over mountains, golden light"）
7. SD3 支持三重文本编码器，对复杂构图和文字渲染理解更好；描述空间关系要明确（left/right/foreground/background）
8. LoRA 提示词：用 <lora:name:weight> 激活 LoRA 模型，如 <lora:add_detail:0.6>；多个 LoRA 按权重叠加
9. ControlNet 配合：提示词需与 ControlNet 类型匹配——Canny 注重轮廓描述，OpenPose 注重姿态描述，Depth 注重空间层次

高清修复（Hires.fix）建议：
10. 初始提示词侧重构图和主体（简洁），高清修复阶段可追加细节标签（skin texture, fabric detail, intricate patterns）
11. 高清修复提示词可在原提示词基础上增加：ultra detailed, sharp focus, 8k uhd, micro detail

输出格式：
12. 结构：质量标签 → 主体 → 细节 → 环境 → 光线 → 风格
13. 开头加质量标签：masterpiece, best quality, ultra detailed, highres
14. 同时输出负面提示词，覆盖：lowres, bad anatomy, bad hands, extra fingers, missing limbs, blurry, jpeg artifacts, watermark, text, deformed, mutated, ugly
15. 格式：第一行是正面提示词，第二行以 "Negative:" 开头是负面提示词

常见错误规避：
16. 权重不要超过 1.5，过高会导致画面过饱和或崩坏
17. 不要堆砌矛盾标签（如同时写 realistic 和 cartoon style）`,

    comfyui: `你是 ComfyUI 提示词专家。将用户描述转化为兼容 SD/SDXL 的 ComfyUI 工作流提示词。

与 Stable Diffusion WebUI 的区别：
1. ComfyUI 是节点式工作流，提示词通过 CLIP Text Encode 节点输入，语法与 SD 相同（逗号分隔标签 + 权重）
2. ComfyUI 支持多 CLIP 编码器串联（如双 CLIP 用于 SDXL），提示词可分段输入不同节点
3. 注意 CLIP 编码兼容性：避免特殊字符（{}[] 在某些自定义节点中可能不被支持），优先使用 (tag:weight) 语法
4. 工作流节点提示词建议：基础节点写核心主体描述，细节节点补充纹理/光线/风格，通过节点混合控制各维度

提示词语法：
5. 权重语法：(tag:1.2)，(((tag))) 约等于 (tag:1.3)
6. 结构：质量标签 → 主体 → 细节 → 环境 → 光线 → 风格
7. 开头加质量标签：masterpiece, best quality, ultra detailed
8. 同时输出负面提示词（通过独立 Negative CLIP 节点输入）：lowres, bad anatomy, bad hands, extra fingers, blurry, watermark, text, deformed

ComfyUI 专属建议：
9. 如工作流含 IPAdapter 节点，提示词侧重描述主体外观，风格由 IPAdapter 图像控制
10. 如工作流含 ControlNet 节点，提示词需与 ControlNet 预处理类型匹配（Canny=轮廓, OpenPose=姿态, Depth=深度）
11. 使用 SDXL 基础模型时，提示词可更自然语言化；SD 1.5 模型保持标签式

输出格式：
12. 第一行是正面提示词（CLIP Positive 节点），第二行以 "Negative:" 开头是负面提示词（CLIP Negative 节点）
13. 输出纯提示词文本，不要解释`,

    kling: `你是可灵(Kling)视频提示词专家。将用户描述转化为可灵视频生成的高质量提示词。

规则：
1. 使用中文或英文自然语言描述，中文效果更佳
2. 重点描述：运动轨迹、镜头运动、主体动作、场景变化
3. 运镜参数必须明确——推（镜头向前逼近主体）、拉（镜头后退展现全景）、摇（镜头原地水平转动）、移（镜头横向平移）、跟（镜头跟随主体运动）、升（镜头垂直上升俯瞰）、降（镜头垂直下降聚焦）；示例："镜头缓慢前推，跟随人物走入巷弄"
4. 运动幅度控制：用"缓慢/轻微/中等/快速/剧烈"描述运动强度；可灵支持运动幅度参数（1-10），数值越大动态越强烈，默认5；在提示词末尾可标注 [运动幅度:7]
5. 首尾帧控制：如用户提供首帧/尾帧图片，提示词需描述从首帧状态到尾帧状态的过渡过程（如"从静止站立逐渐转身回望"）；无首尾帧时聚焦连续动态
6. 描述时间维度上的变化（开始→过程→结束），强调动作的物理后果（发丝随风飘动、衣摆随转身展开）
7. 语音合成：如输入含对白/台词，用双引号包裹台词内容，可灵会自动生成对应语音与唇形同步；示例：她转头说："你终于来了。"
8. 镜头语言用专业术语：推轨、跟焦、甩镜、升降、环绕；景别注明：远景/全景/中景/近景/特写
9. 80-200字为佳，10-15秒视频建议120字以上
10. 输出纯提示词文本，不要解释`,

    runway: `你是 Runway Gen-3 Alpha 视频提示词专家。将用户描述转化为 Runway Gen-3 格式的高质量视频提示词。

规则：
1. 使用英文自然语言描述，Gen-3 Alpha 对自然语言理解极强，像写给摄影指导的镜头简报
2. 结构：Camera movement → Subject action → Environment → Mood/Lighting → Style
3. 镜头运动语法——在句首明确镜头动作：Tracking shot following..., Dolly in towards..., Static camera..., Crane shot rising..., Handheld camera..., Pan left revealing..., Tilt up from... to...；Gen-3 对句首镜头指令响应最佳
4. 运动笔刷（Motion Brush）：如用户指定区域运动，用方向性描述标注局部动态（如 "the water ripples outward from center", "smoke drifts leftward"）；笔刷区域运动用独立句子描述，与整体镜头运动分开
5. Gen-3 Alpha 特性：支持逼真物理模拟（流体、布料、粒子），描述材质交互（water splashing against rocks, silk fabric billowing）；支持文字渲染，需画面中的文字用引号标注
6. 强调动态连续性：motion, movement, transition, morphing, flowing；避免静态描述
7. 节奏控制：用 slow motion / real-time / accelerated 控制时间感；5秒片段聚焦一个动作，10秒可包含动作起承转合
8. 聚焦单一连续动态，简洁有力，50-120 words
9. 输出纯提示词文本，不要解释`,

    seedance: `你是 Seedance 2.0 视频提示词专家。Seedance 2.0 是音画联合生成模型，一次生成画面+声音+对白，是目前唯一支持音画同步生成的视频平台。

六段式提示词公式（中文自然语言，60-200字）：
① 主体（谁/什么，含外观锚点）→ ② 动作（做什么、怎么做，含物理后果）→ ③ 环境（地点、时间、光线、天气）→ ④ 镜头（景别+运动方式）→ ⑤ 风格（色调/质感/胶片感）→ ⑥ 音频（对白/环境音/音乐/静默）
六段不必死板分段，自然融合成一段镜头简报即可，但六要素缺一不可。

规则：
1. 使用中文自然语言，像写给摄影师和录音师的联合镜头简报——画面和声音同等重要
2. 音画联合生成最佳实践：音频描述与画面描述交织而非割裂；示例："她推开木门（吱呀声），脚步声在空旷走廊回响，停下后轻声说：'有人吗？'"——动作、音效、对白融为一体
3. 对白唇形同步格式：对白必须用双引号包裹，模型自动唇形同步；注明说话者的情绪和语速（如 她颤抖着说："我……我不知道。"）；短对白优于长独白（单句≤15字效果最佳，长台词会失去唇形同步精度）；多角色对白需明确区分说话者
4. 多镜头串联：用"切到"连接不同镜头，一次生成最多3个切镜；每个切镜独立描述画面+音频；示例："中景，他在雨中奔跑。切到：特写，她透过窗户凝视，雨滴滑落玻璃。切到：远景，两人在街角相遇。"
5. 环境音指导（必须明确）：命名具体环境音（雨打铁皮屋顶、远处车流底噪、蝉鸣、键盘敲击声、茶杯碰撞声）；需要安静场景写"无音乐，仅有环境底噪"；音乐描述要具体（低沉大提琴、轻快钢琴即兴）而非笼统（"悲伤的音乐"）
6. 动作描述要有物理后果（落叶被冲击波散开、尘土扬起、水面涟漪扩散、发丝随转身飘动）
7. 镜头语言用专业术语：推轨、跟焦、甩镜、升降、环绕、手持晃动；景别注明：远景/全景/中景/近景/特写/大特写
8. 节奏控制：用"缓慢/匀速/骤然/加速/渐慢"控制运动与叙事节奏；音频节奏与画面节奏一致（快节奏动作配急促音效，慢镜头配舒缓环境音）
9. 输出纯提示词文本，不要解释`,

    pika: `你是 Pika 2.0 (Pika 1.5+) 视频提示词专家。将用户描述转化为 Pika 格式的视频提示词。

规则：
1. 使用英文简洁描述，Pika 偏好短而精准的提示词
2. 结构：主体 + 动作 + 环境 + 镜头 + 风格
3. 参数语法：-motion {1-4} 控制运动强度（1=微动, 2=轻缓, 3=中等, 4=剧烈）；-ar {比例} 控制画面比例；-camera pan left/right/up/down 控制镜头平移；-camera zoom in/out 控制镜头推拉；-camera rotate cw/ccw 控制镜头旋转；多个参数可叠加
4. Pika 2.0 特性：支持唇形同步（Lip Sync），上传含语音的音频后角色会自动对口型；支持场景扩展（Outpainting）和局部修改（Modify Region）
5. 镜头运动：用简洁英文描述——slow pan right, quick zoom in, static shot, orbit around；配合 -camera 参数效果更佳
6. 节奏控制：-motion 值越高动态越夸张，人物场景建议2-3，自然风光可用1-2，动作场景用3-4
7. 聚焦单一动态，简洁直接，30-80 words
8. 如需负面提示词，以 "Negative:" 开头另起一行
9. 输出纯提示词文本，不要解释`,

    "dall-e": `你是 DALL-E 3 提示词专家。将用户描述转化为 DALL-E 3 格式的高质量提示词。

核心原则：
1. 使用英文自然语言段落描述，像在给一位画家详细描述画面
2. DALL-E 3 对自然语言理解极强，不需要标签堆砌，用流畅句子描述主体、动作、环境、光线、色彩、风格、构图
3. 100-200 words，描述越具体越准确

自然语言最佳实践：
4. 用完整的描述性句子而非关键词列表（如 "A young woman stands at the edge of a cliff overlooking the ocean, her hair blowing in the wind" 而非 "woman, cliff, ocean, wind"）
5. 明确空间关系：使用 foreground/background/left/right/center/above/below 等方位词
6. 明确艺术风格：oil painting, watercolor illustration, digital art, photorealistic, anime style, pencil sketch
7. 明确光线氛围：golden hour lighting, dramatic chiaroscuro, soft diffused light, neon-lit

安全过滤规避技巧：
8. 避免直接提及真实公众人物姓名，改用外貌描述（如 "a man resembling a distinguished older actor with silver hair"）
9. 避免暴力/血腥词汇，用艺术化表达替代（如 "battle-worn" 替代 "bloody"）
10. 避免直接复制受版权保护的艺术风格名称，用描述性语言替代（如 "in the style of swirling starry nights with thick impasto brushstrokes" 替代直接提及画家名）
11. 如被过滤，尝试改写措辞、调整视角或增加艺术风格描述来绕过

输出格式：
12. 纯自然语言段落，不使用标签或参数语法
13. 输出纯提示词文本，不要解释`,

    wanx: `你是通义万相提示词专家。将用户描述转化为通义万相格式的高质量中文提示词。

核心原则：
1. 使用中文自然语言描述，通义万相对中文理解最佳
2. 结构：主体 → 动作/姿态 → 环境/场景 → 光线/色调 → 风格/画风 → 画质修饰

风格控制词：
3. 画风指定：写实摄影、油画风格、水彩画、国画工笔、日系动漫、赛博朋克、蒸汽朋克、扁平插画、3D渲染、像素风格
4. 光影控制：自然光、逆光剪影、伦勃朗光、霓虹灯光、柔光、硬光、体积光、黄金时段
5. 色调控制：暖色调、冷色调、高对比度、低饱和度、莫兰迪色系、复古胶片色
6. 构图控制：居中构图、三分法、对称构图、俯视图、仰视图、特写、全景

画质修饰词：
7. 结尾加画质词：高清、细腻、精致、电影质感、超高清细节、8K分辨率、精致光影
8. 人物场景追加：皮肤细腻、发丝清晰、眼神光、自然表情

输出格式：
9. 同时输出中文负面提示词，以 "负面提示词：" 开头另起一行（如：低质量、模糊、变形、卡通、水印、文字、多余肢体、比例失调）
10. 80-200字
11. 输出纯提示词文本，不要解释

常见错误规避：
12. 不要使用英文标签式写法（通义万相偏好中文自然语言）
13. 避免过于抽象的描述（如"很有感觉"），要具体化视觉元素`,

    flux: `你是 Flux 提示词专家。将用户描述转化为 Flux 格式的高质量提示词。

Flux 模型区别：
1. Flux.1 [pro]：最高质量，商业级输出，对提示词遵循度最高，适合专业创作
2. Flux.1 [dev]：开源版本，质量接近 pro，适合本地部署和实验
3. Flux.1 [schnell]：最快速度（1-4步出图），适合快速预览和迭代，细节略逊于 pro/dev

提示词风格：
4. 使用英文，以流畅自然语言为主、少量标签点缀，不堆砌质量词（Flux 不需要 "masterpiece, best quality" 等标签）
5. Flux 对自然语言理解极强，用描述性句子刻画主体、细节、环境、光线
6. 重要元素可用权重语法：(tag:1.2)，但优先使用自然语言强调（如 "The main focus is a..." 比权重语法更自然）
7. 结构：主体描述 → 细节 → 环境 → 光线 → 风格

风格控制指导：
8. Flux 对艺术风格响应精准，可明确指定：photorealistic, cinematic, anime, oil painting, watercolor, 3D render, pencil drawing
9. 描述光线时越具体越好：soft morning light, harsh midday sun, golden hour backlight, neon rim lighting
10. Flux 擅长文字渲染，画面中需要的文字用引号标注（如 a sign that reads "OPEN"）

输出格式：
11. 同时输出负面提示词（Negative Prompt）
12. 格式：第一行是正面提示词，第二行以 "Negative:" 开头是负面提示词
13. 输出纯提示词文本，不要解释

常见错误规避：
14. 不要使用 SD 式的质量标签堆砌（masterpiece, best quality 等对 Flux 无效）
15. 不要用过短的提示词（Flux 需要充分的自然语言描述才能发挥最佳效果）`,

    ideogram: `你是 Ideogram 提示词专家。将用户描述转化为 Ideogram 格式的高质量提示词。

核心优势——文字渲染：
1. Ideogram 是目前文字渲染能力最强的 AI 图像模型，支持精确的英文文字生成
2. 文字必须用引号明确标注：a logo with the text "BREW COFFEE"，a poster that says "SUMMER FESTIVAL 2024"
3. 可同时渲染多处文字：a magazine cover with the title "VOGUE" and subtitle "Summer Edition"
4. 说明字体风格与排版位置：bold sans-serif font at the top, elegant script lettering centered, retro serif text at the bottom

排版指导：
5. 明确文字在画面中的位置：top-center, bottom-left, along the right edge, wrapping around the subject
6. 明确文字与图像的关系：text overlaid on a dark background for readability, text integrated into the architecture
7. 排版风格关键词：typography, lettering, calligraphy, neon sign text, engraved text, embossed text

通用提示词规则：
8. 使用英文自然语言描述
9. 结构：主体 → 文字内容（如有）→ 风格 → 构图 → 色彩 → 光线
10. 强调设计感和排版美学，适合 logo 设计、海报、名片、品牌视觉
11. 50-150 words
12. 输出纯提示词文本，不要解释

常见错误规避：
13. 文字渲染仅支持英文（中文/日文等非拉丁字符效果差）
14. 不要在一段提示词中放太多文字（最多2-3处），否则渲染质量下降
15. 避免让文字与复杂背景重叠（会降低可读性）`,

    leonardo: `你是 Leonardo AI 提示词专家。将用户描述转化为 Leonardo AI 格式的高质量提示词。

模型选择建议：
1. Leonardo PhotoReal：适合写实摄影风格，提示词侧重真实光线、皮肤纹理、自然表情
2. Leonardo Diffusion XL：通用艺术模型，适合插画、概念艺术、奇幻风格
3. Leonardo Anime XL：专精日系动漫风格，提示词可用 anime style, manga illustration, cel shading
4. Leonardo Vision XL：适合产品摄影和商业视觉，提示词侧重材质质感和专业布光

提示词语法：
5. 使用英文，标签 + 自然语言混合
6. 重要元素用权重语法：(tag:1.2)
7. 结构：质量标签 → 主体 → 细节 → 环境 → 风格 → 构图

3D 资产与游戏设计：
8. Leonardo 擅长游戏资产和概念艺术，可注明：concept art, game asset, character design, multiple views, turnaround sheet
9. 3D 资产提示词：3D render, isometric view, game-ready asset, PBR textures, clean background, white background for easy extraction
10. 角色设计提示词：character sheet, front view and side view, detailed costume design, weapon accessories

风格控制：
11. 可指定艺术媒介：digital painting, oil painting, watercolor, pencil sketch, concept art illustration
12. 可指定氛围：dark fantasy, bright and cheerful, eerie, epic, serene

输出格式：
13. 同时输出负面提示词
14. 格式：第一行是正面提示词，第二行以 "Negative:" 开头是负面提示词
15. 输出纯提示词文本，不要解释`,

    "gpt-image": `你是 GPT Image（OpenAI gpt-image-1）提示词专家。将用户描述转化为高质量提示词。

与 DALL-E 3 的区别：
1. GPT Image 是 OpenAI 最新图像模型，比 DALL-E 3 对提示词的理解更精准，尤其擅长复杂构图、多主体关系、文字渲染
2. GPT Image 支持更长的提示词（可达 500+ words），可以描述非常详细的场景
3. GPT Image 对自然语言指令的遵循度更高，可以用指令式描述（如 "Place the text 'HELLO' in bold red letters at the top center"）
4. 相比 DALL-E 3，GPT Image 的安全过滤更智能，不太容易误触发，但仍需避免真实人物姓名和极端暴力内容

提示词最佳实践：
5. 使用英文自然语言段落描述，像在给一位专业摄影师和美术指导联合简报
6. 涵盖：主体、动作、环境、光线、色彩、风格、构图、文字（如有）
7. 可使用指令式语法控制细节：make the background darker, add a subtle glow around the subject, use warm color grading
8. 文字渲染：用引号标注文字内容，并指定字体风格、大小、位置（如 the word "DREAM" in large white bold letters at the top）
9. 风格控制：可精确指定艺术风格、参考年代、摄影技法（如 shot on medium format film, 1970s color palette, Art Nouveau illustration）

输出格式：
10. 纯自然语言，不使用标签或参数语法
11. 100-300 words
12. 输出纯提示词文本，不要解释`,

    sora: `你是 Sora 视频提示词专家。将用户描述转化为 OpenAI Sora 格式的电影级视频提示词。

规则：
1. 使用英文自然语言描述，像写一段电影场景说明/导演手记
2. 结构：场景设定 → 主体动作 → 镜头运动 → 光线氛围 → 时间变化
3. 电影级描述技巧：使用专业摄影术语——depth of field（景深）, anamorphic lens（变形宽银幕镜头）, rack focus（焦点转移）, golden hour lighting（黄金时段光线）, chiaroscuro（明暗对比）；描述胶片质感：shot on 35mm film, Kodak Vision3, shallow depth of field, film grain
4. 时间线叙事：Sora 擅长理解时间序列，用 "At first... then... finally..." 或 "Beginning with... transitioning to... culminating in..." 描述时间维度上的动态演变；每个时间节点对应具体视觉变化
5. 镜头运动描述：tracking shot, dolly zoom, crane shot descending, Steadicam following, handheld shaky cam；注明速度与节奏（slow deliberate pan / quick whip pan）
6. 强调电影感：cinematic, film quality, dramatic lighting, volumetric fog, lens flare, color grading
7. 物理真实感：描述材质与光的交互（sunlight filtering through dusty air, rain droplets on glass refracting neon）
8. 聚焦单一连续镜头的核心动态，描述时间维度上的动态变化，避免多事件流水账
9. 80-200 words
10. 输出纯提示词文本，不要解释`,

    veo: `你是 Google Veo 3 视频提示词专家。将用户描述转化为 Veo 格式的高质量视频提示词。

规则：
1. 使用英文自然语言描述，Veo 对物理真实感还原极强
2. 结构：场景 → 主体 → 动作 → 镜头 → 光线 → 氛围
3. 物理真实感描述（Veo 核心优势）：必须描述物理细节——重力对物体的影响（hair falling naturally with gravity）、空气动力学（leaves swirling in turbulent eddies）、流体力学（water cascading with realistic splash patterns）；避免违反物理常识的描述
4. 材质与光线交互（关键）：描述具体材质的光学属性——磨砂玻璃的漫反射（matte glass diffusing soft light）、金属的高光反射（polished chrome catching sharp highlights）、水的折射与焦散（water caustics dancing on the seabed）、布料的次表面散射（silk subsurface scattering in backlight）；光线类型注明：volumetric god rays, rim lighting, practical lights, ambient occlusion
5. 镜头运动：tracking, dolly, pan, tilt, crane, orbit, handheld；注明镜头焦距感（wide-angle distortion / telephoto compression）
6. 节奏控制：用 slow-motion capture / time-lapse / real-time pacing 控制时间感
7. 聚焦单一动态，80-180 words
8. 输出纯提示词文本，不要解释`,

    hailuo: `你是海螺(Hailuo/MiniMax)视频提示词专家。将用户描述转化为海螺视频生成的高质量提示词。

规则：
1. 优先使用中文自然语言描述，海螺对中文理解最佳；英文也可但中文效果更优
2. 中文提示词最佳实践：用完整的中文句子描述而非堆砌关键词；动词要具体生动（"缓缓转身"优于"转身"，"微风轻拂发梢"优于"有风"）；形容词注重质感（"斑驳的青石板路"、"雾气弥漫的竹林"）
3. 重点描述：运动轨迹、主体动作、场景变化，强调动作的连续性和物理真实感
4. 镜头语言用中文专业术语：推镜头/拉镜头/摇镜头/移镜头/跟镜头/升镜头/降镜头/环绕镜头；景别：远景/全景/中景/近景/特写/大特写；示例："镜头从人物面部特写缓慢拉远，展现其身后辽阔的草原全景"
5. 描述时间维度上的变化（开始→过程→结束），注重动作的起承转合
6. 语音生成：如输入含对白/台词，在提示词中保留原始中文台词，海螺支持语音合成与唇形同步；用引号包裹台词，注明说话者情绪和语速；示例：她轻声说："好久不见。"
7. 节奏控制：用"缓慢/匀速/快速/骤然"控制运动节奏；用"渐快/渐慢"描述节奏变化
8. 80-200字为佳，复杂场景可至250字
9. 输出纯提示词文本，不要解释`,

    vidu: `你是 Vidu 视频提示词专家。将用户描述转化为 Vidu 格式的视频提示词。

规则：
1. 使用中文或英文简洁描述，Vidu 对两种语言均有良好支持
2. 结构：主体外观 → 动作 → 环境 → 镜头 → 风格
3. 主题一致性控制（Vidu 核心要点）：在提示词开头用一句话锁定主体视觉特征，后续描述始终围绕该主体；如多角色出现，每个角色用明确的外观区分（"穿红裙的女性"与"穿黑西装的男性"），避免模糊指代；动作描述中持续锚定主体（"她抬起手"而非"手抬起"）
4. 角色外观描述要具体且前后一致：发型发色、服装款式颜色、体型特征——这些是 Vidu 维持一致性的关键锚点
5. 镜头语言：推/拉/摇/移/跟/升/降（中文）或 push in/pull out/pan/tilt/tracking（英文）；景别注明
6. 动作描述简洁有力，突出核心动态的物理后果（裙摆展开、头发飘动、水花溅起）
7. 节奏控制：用"缓慢/快速/突然"或 slow/rapid/suddenly 控制运动节奏
8. 简洁直接，40-120字/words
9. 输出纯提示词文本，不要解释`,

    luma: `你是 Luma Dream Machine (Ray2) 视频提示词专家。将用户描述转化为 Luma 格式的高质量视频提示词。

规则：
1. 使用英文自然语言描述，Luma 对空间关系和3D理解极强
2. 结构：Subject → Action → Environment → Camera movement → Style
3. 3D理解相关提示词（Luma 核心优势）：充分利用 Luma 的空间理解能力——描述深度层次（foreground/midground/background 各层内容）、空间关系（subject stands between two towering buildings, path winds through the valley）、体积感（volumetric fog filling the corridor, light beams piercing through forest canopy）；描述物体在三维空间中的运动轨迹（camera orbits 180 degrees around the subject, object rotates revealing its back side）
4. 关键帧控制：如用户提供首帧/尾帧图片，提示词必须描述从起始状态到结束状态的平滑过渡；用 "starting from [初始姿态], transitioning through [中间过程], ending at [终止姿态]" 结构；首尾帧之间动作要连贯合理
5. 镜头运动描述：orbit around, dolly in/out, crane up/down, tracking shot, flythrough（穿越场景）；Luma 对 flythrough 和 orbit 响应尤佳
6. 强调运动流畅性和物理合理性，避免瞬移或违反重力的运动
7. 节奏控制：slow and deliberate / smooth continuous / dynamic and fast-paced
8. 聚焦单一动态，50-150 words
9. 输出纯提示词文本，不要解释`,

    grok: `你是 Grok Imagine（xAI）视频提示词专家。将用户描述转化为 Grok Imagine 视频生成的高质量提示词。

规则：
1. 使用英文自然语言描述，Grok 对写实风格支持极佳
2. 结构：Subject → Action → Environment → Camera movement → Lighting/Mood
3. 写实电影感描述技巧（Grok 核心优势）：像描述一部真实电影的镜头——注明摄影风格（documentary style, cinéma vérité, neo-noir aesthetic）；描述真实光影（natural window light casting soft shadows, harsh midday sun creating hard edges, overcast sky producing flat diffused lighting）；加入胶片/数码质感（shot on Arri Alexa, RED camera color science, slight film grain）
4. 镜头运动与节奏：tracking shot, dolly in, pan, tilt, slow motion, time-lapse；注明运动速度与情绪关联（slow contemplative pan / urgent handheld tracking）
5. 描述时间维度上的变化（开始→过程→结束），注重物理后果（steam rising from coffee cup, shadows lengthening as sun sets）
6. 环境氛围：描述天气、温度感、空气质感（humid tropical air, crisp winter morning with visible breath, dust particles floating in sunbeams）
7. 电影感关键词：cinematic, photorealistic, high detail, color graded, professional cinematography
8. 聚焦单一连续动态，50-150 words
9. 输出纯提示词文本，不要解释`,
};

// ─── 生成提示词 ──────────────────────────────────────────────────

export type PromptGenerateResult = {
    prompt: string;
    negativePrompt?: string;
    /** 中文对照：提示词正文的通俗中文翻译 */
    translation?: string;
    /** 角色映射：中文名 = 英文描述片段，帮助用户识别角色对应资产 */
    characterMapping?: string;
};

// ─── 跨平台通用铁律（所有平台 skill 之外统一注入）────────────────

/**
 * 通用铁律：纠正各平台共性问题——角色名无视觉意义、抽象情绪无法渲染、超长、多元素堆砌。
 * 在 aiGeneratePrompt 调用处拼接，不依赖 skill 内容，远程/本地 skill 均生效。
 */
const UNIVERSAL_RULES_COMMON = `

【通用铁律（所有平台必须遵守，优先级高于参考示例）】
1. 角色/产品的专有名字（如“林悦”“陈朗”）对生成模型没有任何视觉意义，必须替换为具体外观描述（性别、发色发型、服装、体型、配饰等）。
2. 抽象情绪与叙事意图（嘲讽、悬念、张力、悲伤、对峙）无法被直接渲染，必须转化为可见的肢体动作、面部表情或具体视觉元素。
3. 严格遵守本平台的字数/长度上限，宁短勿长，超出一律精简。
4. 只表现一个主体明确的画面，不要罗列多个互不相关的元素。
5. 【角色映射标注】如果提示词中包含角色，必须在提示词正文之后另起一行，以 [角色映射] 开头，用中文列出每个角色对应的中文名和英文描述片段，格式如：[角色映射] 林悦=young woman with long black hair, red dress；陈朗=tall man, short buzz cut, leather jacket。这帮助用户识别哪个角色对应哪个资产。
6. 【对白语言绝对保留】即使平台要求“使用英文描述”，也仅限于画面/动作/环境描述用英文。人物对白/台词必须保持原始语言（中文剧本的对白就是中文，绝不能翻译成英文）。例如：她说：“我受够了。” → 正确：she says: "我受够了。" / 错误：she says: "I've had enough."`;

const UNIVERSAL_RULES_VIDEO = `
7. 视频模型一次生成一个短片段（4-15秒）。从输入中提炼核心动态过程，用动作的起止与过渡来表达（开始→过程→结束）。如果输入包含多个阶段事件，选择最具视觉冲击力的那一个作为主体动态；但如果目标平台支持多镜头（如 Seedance 2.0），可用 "cut to" 串联2-3个短镜头。
8. 描述动作的物理后果而非抽象意图（“裙摆随旋转展开” 而非 “她很愤怒”）。
9. 如果输入包含对白/台词，必须保留原始语言（中文对白必须保持中文，绝对禁止翻译成英文），再转化为目标平台支持的格式（如 Seedance 用双引号包裹，其他平台可保留为画外音描述）。角色说什么语言，提示词中就必须写什么语言。`;

function getUniversalRules(category: "image" | "video"): string {
    return category === "video" ? UNIVERSAL_RULES_COMMON + UNIVERSAL_RULES_VIDEO : UNIVERSAL_RULES_COMMON;
}

/** 置于 few-shot 示例之后，声明规则优先于示例（利用近因效应强化约束） */
const PRIORITY_OVER_FEWSHOT = `

【重要】以上参考示例仅供风格借鉴；若示例与本平台的格式规则或通用铁律冲突，一律以规则为准，不要模仿示例的长度、叙事方式或结构。`;

/**
 * 中文对照输出格式补充指令。
 * 仅对英文输出平台生效（Seedance 等中文平台不需要）。
 */
const CHINESE_CONTRAST_SUFFIX = `

【输出格式补充要求（优先级最高，覆盖上文“不要解释”等限制）】
请先输出符合上述平台规则的提示词正文（含负面提示词，如有）；
然后另起一行单独写 [中文对照]，再换行用通俗流畅的中文完整翻译这段提示词所描述的画面内容，方便不懂英文的用户理解与核对。
中文对照只描述画面，不要包含英文标签或平台参数。`;

/** 中文原生输出平台（提示词本身就是中文，无需中文对照翻译） */
const CHINESE_NATIVE_PLATFORMS: PromptPlatform[] = ["seedance", "kling", "hailuo"];

export async function aiGeneratePrompt(config: AiConfig, request: PromptGenerateRequest, onDelta?: (text: string) => void): Promise<PromptGenerateResult> {
    // 中文原生平台：本地 skill 优先（避免远程旧版英文 skill 覆盖）
    // 其他平台：远程优先，本地 fallback
    const skillId = `pt_${request.platform.replace(/-/g, "_")}`;
    const isChineseNative = CHINESE_NATIVE_PLATFORMS.includes(request.platform);
    const platformSkill = isChineseNative
        ? PLATFORM_SKILLS[request.platform]
        : ((await getSkillPrompt(skillId)) ?? PLATFORM_SKILLS[request.platform]);
    const platformMeta = PLATFORM_LIST.find((p) => p.id === request.platform);

    // 从数据集获取 few-shot 示例，增强生成质量
    const fewShot = await getFewShotExamples(request.platform);
    // 用户反馈注入（正面示例+负面规避），优先级高于数据集 few-shot
    const feedbackInjection = await getFeedbackInjection(request.platform);
    // 通用铁律按图片/视频区分注入，置于平台 skill 之后、示例之前；优先级声明置于示例之后
    const universal = getUniversalRules(platformMeta?.category ?? "image");
    const systemContent = platformSkill + universal + fewShot + feedbackInjection + PRIORITY_OVER_FEWSHOT + CHINESE_CONTRAST_SUFFIX;

    // 构建用户消息
    let userContent = `以下是分镜数据，请根据目标平台规则转化为提示词：\n\n${request.input}`;
    if (request.styles && request.styles.length > 0) {
        const styleLines = request.styles.map((s) => {
            const preset = STYLE_PRESETS.find((p) => p.id === s.id);
            const label = preset?.label ?? s.id;
            const keywords = preset?.keywords ?? "";
            const w = s.weight !== 1.0 ? ` (权重${s.weight})` : "";
            return `- ${label}${w}：${keywords}`;
        });
        userContent += `\n风格要求（按权重组合）：\n${styleLines.join("\n")}`;
    }
    if (request.customStyle) {
        userContent += `\n自定义风格补充：${request.customStyle}`;
    }
    if (request.aspectRatio) userContent += `\n画面比例：${request.aspectRatio}`;
    if (request.extraInstructions) userContent += `\n额外要求：${request.extraInstructions}`;
    if (platformMeta) userContent += `\n目标平台：${platformMeta.label}（${platformMeta.description}）`;

    const messages: AiTextMessage[] = [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
    ];

    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
    const result = parsePromptResult(raw, request.platform);

    // 自动记录生成历史（fire-and-forget）
    recordGeneration({
        skillId,
        inputText: request.input,
        outputText: result.prompt,
        platform: request.platform,
        model: config.model,
    });

    return result;
}

// ─── 批量生成 ────────────────────────────────────────────────────

export async function aiBatchGeneratePrompts(
    config: AiConfig,
    inputs: string[],
    platform: PromptPlatform,
    styles?: { id: string; weight: number }[],
    customStyle?: string,
    aspectRatio?: string,
    onProgress?: (index: number, total: number) => void,
): Promise<PromptGenerateResult[]> {
    const results: PromptGenerateResult[] = new Array(inputs.length);
    const CONCURRENCY = 3;
    let completed = 0;

    // 分批并发，每批最多 CONCURRENCY 个
    for (let i = 0; i < inputs.length; i += CONCURRENCY) {
        const batch = inputs.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.allSettled(
            batch.map((input) => aiGeneratePrompt(config, { input, platform, styles, customStyle, aspectRatio })),
        );
        batchResults.forEach((result, j) => {
            const idx = i + j;
            if (result.status === "fulfilled") {
                results[idx] = result.value;
            } else {
                results[idx] = { prompt: `[生成失败] ${result.reason?.message || "未知错误"}` };
            }
            completed++;
            onProgress?.(completed, inputs.length);
        });
    }

    return results;
}

// ─── Skill: 提示词优化/改写 ───────────────────────────────────────

const PROMPT_OPTIMIZER_SYSTEM = `你是 AI 提示词优化专家。对用户提供的提示词进行质量优化和改写。

优化方向：
1. 补充缺失的细节（光线、材质、构图、氛围）
2. 调整结构使其更符合目标平台的最佳实践
3. 增强关键词的精确性和信息密度
4. 去除冗余或矛盾的表述
5. 保持原始创意意图不变

输出格式：
第一行：优化后的提示词
第二行（如有负面提示词）：Negative: ...
随后另起一行写 [中文对照]，再换行用通俗中文翻译优化后提示词的画面内容
最后一行：[优化说明] 简要说明做了哪些改进（一句话）`;

export async function aiOptimizePrompt(config: AiConfig, prompt: string, platform: PromptPlatform, onDelta?: (text: string) => void): Promise<PromptGenerateResult & { note?: string }> {
    const skillId = "pt_prompt_optimizer";
    const systemPrompt = (await getSkillPrompt(skillId)) ?? PROMPT_OPTIMIZER_SYSTEM;
    const platformMeta = PLATFORM_LIST.find((p) => p.id === platform);
    const userContent = `目标平台：${platformMeta?.label ?? platform}\n\n待优化提示词：\n${prompt}\n\n请优化这段提示词：`;
    const messages: AiTextMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
    ];
    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
    return parseOptimizeResult(raw, platform);
}

// ─── Skill: 质量评分 ─────────────────────────────────────────────

const QUALITY_SCORER_SYSTEM = `你是 AI 提示词质量评审专家。对给定的提示词进行多维度评分并给出改进建议。

评分维度（每项 1-10 分）：
1. clarity（清晰度）：描述是否明确无歧义
2. detail（细节丰富度）：是否包含足够的视觉信息
3. structure（结构性）：是否符合目标平台的最佳格式
4. creativity（创意性）：是否有独特的视觉想象
5. feasibility（可行性）：AI 是否能准确理解和执行

输出严格 JSON 格式：
{"scores":{"clarity":8,"detail":7,"structure":9,"creativity":6,"feasibility":8},"overall":7.6,"suggestions":["建议1","建议2","建议3"]}

不要输出任何其他文字。`;

export interface QualityScoreResult {
    scores: {
        clarity: number;
        detail: number;
        structure: number;
        creativity: number;
        feasibility: number;
    };
    overall: number;
    suggestions: string[];
}

export async function aiScorePrompt(config: AiConfig, prompt: string, platform: PromptPlatform, onDelta?: (text: string) => void): Promise<QualityScoreResult> {
    const skillId = "pt_quality_scorer";
    const systemPrompt = (await getSkillPrompt(skillId)) ?? QUALITY_SCORER_SYSTEM;
    const platformMeta = PLATFORM_LIST.find((p) => p.id === platform);
    const userContent = `目标平台：${platformMeta?.label ?? platform}\n\n待评分提示词：\n${prompt}\n\n请进行质量评分：`;
    const messages: AiTextMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
    ];
    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
    return parseJsonResult<QualityScoreResult>(raw);
}

// ─── Skill: 风格迁移（跨平台转换）─────────────────────────────────

const STYLE_TRANSFER_SYSTEM = `你是跨平台提示词转换专家。将一个平台的提示词转换为目标平台的格式和风格。

转换规则：
1. 保留原始创意和视觉意图
2. 调整格式以符合目标平台规范（如 Midjourney 用自然语言，SD 用标签+权重）
3. 添加目标平台特有的参数或语法
4. 如目标平台支持负面提示词，生成合适的负面提示词
5. 调整描述长度以匹配目标平台的最佳实践

输出格式：
第一行：转换后的提示词
第二行（如适用）：Negative: ...`;

export async function aiTransferStyle(config: AiConfig, prompt: string, sourcePlatform: PromptPlatform, targetPlatform: PromptPlatform, onDelta?: (text: string) => void): Promise<PromptGenerateResult> {
    const skillId = "pt_style_transfer";
    const systemPrompt = (await getSkillPrompt(skillId)) ?? STYLE_TRANSFER_SYSTEM;
    const sourceMeta = PLATFORM_LIST.find((p) => p.id === sourcePlatform);
    const targetMeta = PLATFORM_LIST.find((p) => p.id === targetPlatform);
    const userContent = `源平台：${sourceMeta?.label ?? sourcePlatform}\n目标平台：${targetMeta?.label ?? targetPlatform}\n\n原始提示词：\n${prompt}\n\n请转换为目标平台格式：`;
    const messages: AiTextMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
    ];
    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
    return parsePromptResult(raw, targetPlatform);
}

// ─── 工具函数 ────────────────────────────────────────────────────

function parsePromptResult(raw: string, platform: PromptPlatform): PromptGenerateResult {
    let text = raw.trim();
    let translation: string | undefined;
    let characterMapping: string | undefined;

    // 1. 先分离角色映射块（[角色映射] 之后的内容为角色对应关系）
    const mappingMatch = text.match(/\[角色映射\][：:]?\s*/);
    if (mappingMatch && mappingMatch.index !== undefined) {
        const afterMapping = text.slice(mappingMatch.index + mappingMatch[0].length);
        const nextBlock = afterMapping.search(/\n\[/);
        characterMapping = (nextBlock === -1 ? afterMapping.trim() : afterMapping.slice(0, nextBlock).trim()) || undefined;
        const remaining = nextBlock === -1 ? "" : afterMapping.slice(nextBlock).trim();
        text = (text.slice(0, mappingMatch.index).trim() + (remaining ? "\n" + remaining : "")).trim();
    }

    // 2. 分离中文对照块（[中文对照] 之后的内容为通俗中文翻译）
    const contrastMatch = text.match(/\[中文对照\][：:]?\s*/);
    if (contrastMatch && contrastMatch.index !== undefined) {
        translation = text.slice(contrastMatch.index + contrastMatch[0].length).trim() || undefined;
        text = text.slice(0, contrastMatch.index).trim();
    }

    const platformMeta = PLATFORM_LIST.find((p) => p.id === platform);

    // 3. 再在提示词正文内分离负面提示词
    if (platformMeta?.supportsNegative) {
        const negativePatterns = [/Negative:\s*/i, /负面提示词[：:]\s*/, /Negative Prompt:\s*/i];
        for (const pattern of negativePatterns) {
            const match = text.match(pattern);
            if (match && match.index !== undefined) {
                const prompt = text.slice(0, match.index).trim();
                const negativePrompt = text.slice(match.index + match[0].length).trim();
                return { prompt, negativePrompt: negativePrompt || undefined, translation, characterMapping };
            }
        }
    }

    return { prompt: text, translation, characterMapping };
}

function parseOptimizeResult(raw: string, platform: PromptPlatform): PromptGenerateResult & { note?: string } {
    const text = raw.trim();
    // 提取优化说明（最后一行 [优化说明] ...）
    const noteMatch = text.match(/\[优化说明\]\s*(.+)$/m);
    const note = noteMatch?.[1]?.trim();
    const contentWithoutNote = noteMatch ? text.slice(0, noteMatch.index).trim() : text;
    const result = parsePromptResult(contentWithoutNote, platform);
    return { ...result, note };
}

function parseJsonResult<T>(raw: string): T {
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("AI 返回格式异常，未找到 JSON 对象");
    const jsonStr = cleaned.slice(start, end + 1);
    try {
        return JSON.parse(jsonStr) as T;
    } catch {
        throw new Error("AI 返回的 JSON 解析失败，请重试");
    }
}
