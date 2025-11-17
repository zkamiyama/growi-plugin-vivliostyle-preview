# build-and-push.ps1
# ビルド、コミット、プッシュを1スクリプト化
param(
    [Parameter(Mandatory=$true)]
    [string]$CommitMessage
)

# ビルド実行
Write-Host "Running npm run build..."
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed"
    exit 1
}

# 変更をステージ
Write-Host "Staging changes..."
git add .
if ($LASTEXITCODE -ne 0) {
    Write-Error "Git add failed"
    exit 1
}
# コミット（変更がなければスキップ）
Write-Host "Checking staged changes..."
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "No changes to commit. Skipping commit."
} else {
    $resolvedMessage = $CommitMessage
    if ($resolvedMessage -eq '$npm_config_message') {
        $resolvedMessage = $env:npm_config_message
        if ([string]::IsNullOrWhiteSpace($resolvedMessage)) {
            $resolvedMessage = 'chore: automated build'
        }
    }
    Write-Host "Committing with message: $resolvedMessage"
    git commit -m "$resolvedMessage"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Commit failed"
        exit 1
    }
}

# プッシュ
Write-Host "Pushing to origin main..."
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Error "Push failed"
    exit 1
}

Write-Host "Build, commit, and push completed successfully!"
