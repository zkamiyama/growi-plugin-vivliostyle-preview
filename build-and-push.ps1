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

# コミット
Write-Host "Committing with message: $CommitMessage"
git commit -m $CommitMessage
if ($LASTEXITCODE -ne 0) {
    Write-Error "Commit failed"
    exit 1
}

# プッシュ
Write-Host "Pushing to origin main..."
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Error "Push failed"
    exit 1
}

Write-Host "Build, commit, and push completed successfully!"
