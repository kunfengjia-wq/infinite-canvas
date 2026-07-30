# 下载 Qwen3-TTS-12Hz-1.7B-Base 模型（音色克隆用）
# 复用 curl 断点续传方案

$ErrorActionPreference = "Continue"

$REPO = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
$TOKEN = $env:HF_TOKEN
if (-not $TOKEN) {
    Write-Error "Please set HF_TOKEN environment variable"
    exit 1
}

# HF 缓存目录
$cacheBase = "$env:USERPROFILE\.cache\huggingface\hub"
$modelDir = "$cacheBase\models--$($REPO.Replace('/','--'))"

# 需要下载的文件列表
$FILES = @(
    "config.json",
    "generation_config.json",
    "merges.txt",
    "vocab.json",
    "tokenizer_config.json",
    "preprocessor_config.json",
    "model.safetensors",
    "speech_tokenizer/config.json",
    "speech_tokenizer/configuration.json",
    "speech_tokenizer/model.safetensors",
    "speech_tokenizer/preprocessor_config.json"
)

# 先通过 API 获取 snapshot commit hash
Write-Output "[base-dl] Getting commit hash..."
$apiUrl = "https://huggingface.co/api/models/$REPO"
$apiResp = curl.exe -s --socks5-hostname 127.0.0.1:10808 -H "Authorization: Bearer $TOKEN" $apiUrl | ConvertFrom-Json
$commit = $apiResp.sha
if (-not $commit) {
    Write-Error "Failed to get commit hash"
    exit 1
}
Write-Output "[base-dl] commit: $commit"

# 创建目录结构
$snapDir = "$modelDir\snapshots\$commit"
$blobDir = "$modelDir\blobs"
New-Item -ItemType Directory -Force -Path $snapDir | Out-Null
New-Item -ItemType Directory -Force -Path $blobDir | Out-Null
New-Item -ItemType Directory -Force -Path "$snapDir\speech_tokenizer" | Out-Null

# 逐文件下载
foreach ($file in $FILES) {
    $outPath = "$snapDir\$($file.Replace('/', '\'))"
    $url = "https://huggingface.co/$REPO/resolve/main/$file"
    
    # 跳过已存在的文件（小文件不做续传检查）
    if (Test-Path $outPath) {
        $sz = (Get-Item $outPath).Length
        if ($sz -gt 0) {
            Write-Output "[base-dl] SKIP $file ($([math]::Round($sz/1KB,1)) KB)"
            continue
        }
    }
    
    Write-Output "[base-dl] Downloading $file ..."
    
    $maxAttempts = 50
    for ($i = 1; $i -le $maxAttempts; $i++) {
        curl.exe -L -C - `
            --socks5-hostname 127.0.0.1:10808 `
            -H "Authorization: Bearer $TOKEN" `
            --speed-limit 1000 --speed-time 30 `
            --connect-timeout 30 `
            --max-time 600 `
            -o $outPath `
            $url
        
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0) {
            $sz = (Get-Item $outPath).Length
            Write-Output "[base-dl] OK $file ($([math]::Round($sz/1MB,2)) MB)"
            break
        }
        
        $sz = 0
        if (Test-Path $outPath) { $sz = (Get-Item $outPath).Length }
        Write-Output "[base-dl] attempt $i exit=$exitCode, got $([math]::Round($sz/1MB,2)) MB, retrying..."
        Start-Sleep -Seconds 3
    }
}

Write-Output "[base-dl] Done! Snapshot at: $snapDir"
