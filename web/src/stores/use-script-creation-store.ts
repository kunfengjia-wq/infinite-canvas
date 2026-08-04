import { create } from "zustand";
import { nanoid } from "nanoid";

import { now } from "@/lib/utils";
import { getScriptProjectRepo, preferenceRepo } from "@/services/db";
import type {
    ScriptProject,
    CreationPhase,
    InspirationCard,
    InspirationCardType,
    SettingProposal,
    StructureProposal,
    ScriptSegment,
} from "@/types/script-creation";
import { createEmptyScriptProject } from "@/types/script-creation";

type ScriptCreationStore = {
    /** 所有项目列表 */
    projects: ScriptProject[];
    /** 当前项目 */
    current: ScriptProject | null;
    /** AI 处理中 */
    processing: boolean;
    /** 加载状态 */
    loading: boolean;

    // ─── 项目操作 ───
    loadProjects: () => Promise<void>;
    createProject: (title: string, seed: string) => Promise<string>;
    openProject: (id: string) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;
    forkProject: (id: string) => Promise<string | null>;
    saveCurrent: () => Promise<void>;

    // ─── 阶段流转 ───
    setPhase: (phase: CreationPhase) => void;
    setProcessing: (v: boolean) => void;

    // ─── Phase 1：灵感卡片 ───
    setCards: (cards: InspirationCard[]) => void;
    toggleCard: (cardId: string) => void;
    updateCardDescription: (cardId: string, description: string) => void;
    addCustomCard: (type: InspirationCardType, title: string, description: string) => void;
    removeCardsByType: (type: InspirationCardType) => void;
    appendCards: (cards: InspirationCard[]) => void;
    confirmCards: () => void;

    // ─── Phase 2：设定构建 ───
    setSettingProposals: (proposals: SettingProposal[]) => void;
    updateCharacterInProposal: (proposalId: string, characterId: string, character: SettingProposal["characters"][number]) => void;
    confirmSetting: (proposal: SettingProposal) => void;

    // ─── Phase 3：结构搭建 ───
    setStructureProposals: (proposals: StructureProposal[]) => void;
    reorderBeatsInProposal: (proposalId: string, fromIndex: number, toIndex: number) => void;
    updateBeatInProposal: (proposalId: string, beatId: string, patch: Partial<{ label: string; summary: string; intensity: number }>) => void;
    confirmStructure: (proposal: StructureProposal) => void;

    // ─── Phase 4：逐段创作 ───
    initSegments: () => void;
    updateSegment: (segmentId: string, patch: Partial<ScriptSegment>) => void;
    setContextSummary: (summary: string) => void;

    // ─── Phase 5：完稿 ───
    setFullScript: (script: string) => void;
    setConsistencyReport: (report: string) => void;
    completeProject: () => void;
};

export const useScriptCreationStore = create<ScriptCreationStore>()((set, get) => ({
    projects: [],
    current: null,
    processing: false,
    loading: false,

    loadProjects: async () => {
        set({ loading: true });
        const projects = await getScriptProjectRepo().list();
        set({ projects, loading: false });
    },

    createProject: async (title, seed) => {
        const project = createEmptyScriptProject(title, seed);
        await getScriptProjectRepo().save(project);
        set((state) => ({ projects: [project, ...state.projects], current: project }));
        return project.id;
    },

    openProject: async (id) => {
        const project = await getScriptProjectRepo().get(id);
        if (!project) return;
        set({ current: project });
    },

    deleteProject: async (id) => {
        await getScriptProjectRepo().remove(id);
        set((state) => ({
            projects: state.projects.filter((p) => p.id !== id),
            current: state.current?.id === id ? null : state.current,
        }));
    },

    forkProject: async (id) => {
        const source = await getScriptProjectRepo().get(id);
        if (!source) return null;
        const forked: ScriptProject = {
            ...structuredClone(source),
            id: nanoid(),
            title: `${source.title}（二创）`,
            forkedFrom: source.id,
            status: "exploring",
            phase: 1,
            fullScript: "",
            consistencyReport: "",
            createdAt: now(),
            updatedAt: now(),
        };
        await getScriptProjectRepo().save(forked);
        set((state) => ({ projects: [forked, ...state.projects], current: forked }));
        return forked.id;
    },

    saveCurrent: async () => {
        const { current } = get();
        if (!current) return;
        const updated = { ...current, updatedAt: now() };
        await getScriptProjectRepo().save(updated);
        set((state) => ({
            current: updated,
            projects: state.projects.map((p) => (p.id === updated.id ? updated : p)),
        }));
    },

    // ─── 阶段 ───
    setPhase: (phase) => {
        set((state) => {
            if (!state.current) return state;
            const statusMap: Record<CreationPhase, ScriptProject["status"]> = {
                1: "exploring",
                2: "setting",
                3: "structuring",
                4: "writing",
                5: "completed",
            };
            const maxPhase = Math.max(state.current.maxPhase ?? 1, phase) as CreationPhase;
            return { current: { ...state.current, phase, maxPhase, status: statusMap[phase] } };
        });
        void get().saveCurrent();
    },

    setProcessing: (v) => set({ processing: v }),

    // ─── Phase 1 ───
    setCards: (cards) =>
        set((state) => {
            if (!state.current) return state;
            return { current: { ...state.current, cards } };
        }),

    toggleCard: (cardId) =>
        set((state) => {
            if (!state.current) return state;
            const cards = state.current.cards.map((c) => (c.id === cardId ? { ...c, selected: !c.selected } : c));
            return { current: { ...state.current, cards } };
        }),

    updateCardDescription: (cardId, description) =>
        set((state) => {
            if (!state.current) return state;
            const cards = state.current.cards.map((c) => (c.id === cardId ? { ...c, description } : c));
            return { current: { ...state.current, cards } };
        }),

    addCustomCard: (type, title, description) =>
        set((state) => {
            if (!state.current) return state;
            const card: InspirationCard = { id: nanoid(), type, title, description, selected: true, custom: true, batch: state.current.cardBatch };
            return { current: { ...state.current, cards: [...state.current.cards, card] } };
        }),

    removeCardsByType: (type) =>
        set((state) => {
            if (!state.current) return state;
            const cards = state.current.cards.filter((c) => c.type !== type);
            return { current: { ...state.current, cards } };
        }),

    appendCards: (newCards) =>
        set((state) => {
            if (!state.current) return state;
            return { current: { ...state.current, cards: [...state.current.cards, ...newCards] } };
        }),

    confirmCards: () => {
        const { current } = get();
        if (!current) return;
        // 记录偏好
        const selected = current.cards.filter((c) => c.selected);
        const skipped = current.cards.filter((c) => !c.selected);
        const types = [...new Set(current.cards.map((c) => c.type))];
        types.forEach((type) => {
            void preferenceRepo.add({
                cardType: type,
                selected: selected.filter((c) => c.type === type).map((c) => c.title),
                skipped: skipped.filter((c) => c.type === type).map((c) => c.title),
                timestamp: now(),
            });
        });
        get().setPhase(2);
    },

    // ─── Phase 2 ───
    setSettingProposals: (proposals) =>
        set((state) => {
            if (!state.current) return state;
            return { current: { ...state.current, settingProposals: proposals } };
        }),

    updateCharacterInProposal: (proposalId, characterId, character) =>
        set((state) => {
            if (!state.current) return state;
            const proposals = state.current.settingProposals.map((p) =>
                p.id === proposalId
                    ? { ...p, characters: p.characters.map((c) => (c.id === characterId ? character : c)) }
                    : p,
            );
            return { current: { ...state.current, settingProposals: proposals } };
        }),

    confirmSetting: (proposal) => {
        set((state) => {
            if (!state.current) return state;
            return { current: { ...state.current, finalSetting: proposal } };
        });
        get().setPhase(3);
    },

    // ─── Phase 3 ───
    setStructureProposals: (proposals) =>
        set((state) => {
            if (!state.current) return state;
            return { current: { ...state.current, structureProposals: proposals } };
        }),

    reorderBeatsInProposal: (proposalId, fromIndex, toIndex) =>
        set((state) => {
            if (!state.current) return state;
            const proposals = state.current.structureProposals.map((p) => {
                if (p.id !== proposalId) return p;
                const beats = [...p.beats];
                const [moved] = beats.splice(fromIndex, 1);
                beats.splice(toIndex, 0, moved);
                return { ...p, beats: beats.map((b, i) => ({ ...b, index: i })) };
            });
            return { current: { ...state.current, structureProposals: proposals } };
        }),

    updateBeatInProposal: (proposalId, beatId, patch) =>
        set((state) => {
            if (!state.current) return state;
            const proposals = state.current.structureProposals.map((p) =>
                p.id === proposalId
                    ? { ...p, beats: p.beats.map((b) => (b.id === beatId ? { ...b, ...patch } : b)) }
                    : p,
            );
            return { current: { ...state.current, structureProposals: proposals } };
        }),

    confirmStructure: (proposal) => {
        set((state) => {
            if (!state.current) return state;
            return { current: { ...state.current, finalStructure: proposal } };
        });
        // 初始化段落
        get().initSegments();
        get().setPhase(4);
    },

    // ─── Phase 4 ───
    initSegments: () =>
        set((state) => {
            if (!state.current?.finalStructure) return state;
            const segments: ScriptSegment[] = state.current.finalStructure.beats.map((beat, i) => ({
                id: nanoid(),
                beatId: beat.id,
                index: i,
                title: beat.label,
                content: "",
                status: "pending" as const,
                rewriteCount: 0,
            }));
            return { current: { ...state.current, segments } };
        }),

    updateSegment: (segmentId, patch) =>
        set((state) => {
            if (!state.current) return state;
            const segments = state.current.segments.map((s) => (s.id === segmentId ? { ...s, ...patch } : s));
            return { current: { ...state.current, segments } };
        }),

    setContextSummary: (summary) =>
        set((state) => {
            if (!state.current) return state;
            return { current: { ...state.current, contextSummary: summary } };
        }),

    // ─── Phase 5 ───
    setFullScript: (script) =>
        set((state) => {
            if (!state.current) return state;
            return { current: { ...state.current, fullScript: script } };
        }),

    setConsistencyReport: (report) =>
        set((state) => {
            if (!state.current) return state;
            return { current: { ...state.current, consistencyReport: report } };
        }),

    completeProject: () => {
        get().setPhase(5);
        void get().saveCurrent();
    },
}));
