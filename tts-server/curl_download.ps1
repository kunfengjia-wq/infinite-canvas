# curl 下载 model.safetensors
# 优势：--speed-limit 能检测"假活"连接（有TCP但无数据），自动断开重试
# -C - 断点续传，配合 --retry 实现无限自动恢复

$ErrorActionPreference = "Continue"

$REPO = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
$FILENAME = "model.safetensors"
$URL = "https://huggingface.co/$REPO/resolve/main/$FILENAME"
$TOKEN = $env:HF_TOKEN
if (-not $TOKEN) {
    Write-Error "Please set HF_TOKEN environment variable"
    exit 1
}

# 找到 HF 缓存快照目录
$cacheBase = "$env:USERPROFILE\.cache\huggingface\hub"
$modelDir = "$cacheBase\models--$($REPO.Replace('/','--'))"
$snapDir = Get-ChildItem "$modelDir\snapshots" -Directory | Select-Object -First 1
if (-not $snapDir) {
    Write-Error "snapshot dir not found"
    exit 1
}
$OUT = "$($snapDir.FullName)\$FILENAME"
Write-Output "[curl-dl] target: $OUT"
Write-Output "[curl-dl] url: $URL"

# 先获取文件总大小
Write-Output "[curl-dl] getting file size..."
$headers = curl -sI -L --socks5-hostname 127.0.0.1:10808 -H "Authorization: Bearer $TOKEN" $URL
$totalLine = $headers | Select-String "content-length" | Select-Object -Last 1
$totalSize = 0
if ($totalLine) {
    $totalSize = [long]($totalLine -replace '[^0-9]','')
    Write-Output "[curl-dl] total size: $([math]::Round($totalSize/1GB, 2)) GB"
}

# 下载循环
$maxAttempts = 200
for ($i = 1; $i -le $maxAttempts; $i++) {
    $curSize = 0
    if (Test-Path $OUT) { $curSize = (Get-Item $OUT).Length }
    if ($totalSize -gt 0 -and $curSize -ge $totalSize) {
        Write-Output "[curl-dl] COMPLETE: $([math]::Round($curSize/1MB,1)) MB"
        break
    }
    Write-Output "[curl-dl] attempt $i/$maxAttempts - resume from $([math]::Round($curSize/1MB,1)) MB"
    
    # curl 参数：
    #   -C -          断点续传
    #   --speed-limit 1000   速度低于 1000 B/s...
    #   --speed-time 30      ...持续 30 秒则断开
    #   --connect-timeout 30 连接超时
    #   --max-time 600       单次最长 10 分钟（防止无限挂起）
    #   -L            跟随重定向
    #   --socks5-hostname  通过 SOCKS5 代理（远程 DNS）
    curl -L -C - `
        --socks5-hostname 127.0.0.1:10808 `
        -H "Authorization: Bearer $TOKEN" `
        -H "User-Agent: qoder-tts/1.0" `
        --speed-limit 1000 --speed-time 30 `
        --connect-timeout 30 `
        --max-time 600 `
        -o $OUT `
        $URL
    
    $exitCode = $LASTEXITCODE
    $newSize = 0
    if (Test-Path $OUT) { $newSize = (Get-Item $OUT).Length }
    $delta = $newSize - $curSize
    Write-Output "[curl-dl] attempt $i ended: exit=$exitCode, now $([math]::Round($newSize/1MB,1)) MB (+$([math]::Round($delta/1MB,1)) MB)"
    
    # exit code 18 = partial transfer (server closed), 28 = timeout, 56 = recv failure
    # 这些都是可重试的
    if ($exitCode -eq 0) {
        Write-Output "[curl-dl] SUCCESS (exit 0)"
        break
    }
    
    # 如果完全没有进展（连续多次），等待后重试
    if ($delta -le 0) {
        Write-Output "[curl-dl] no progress, waiting 5s..."
        Start-Sleep -Seconds 5
    } else {
        Start-Sleep -Seconds 2
    }
}

# 最终验证
$finalSize = 0
if (Test-Path $OUT) { $finalSize = (Get-Item $OUT).Length }
if ($totalSize -gt 0 -and $finalSize -ge $totalSize) {
    Write-Output "[curl-dl] VERIFIED: $([math]::Round($finalSize/1MB,1)) MB / $([math]::Round($totalSize/1MB,1)) MB"
} else {
    Write-Output "[curl-dl] INCOMPLETE: $([math]::Round($finalSize/1MB,1)) MB / $([math]::Round($totalSize/1MB,1)) MB"
}
