# Deploy only codebase "web". Does not touch Python codebase "python".
Set-Location (Join-Path $PSScriptRoot "..")
firebase deploy --only functions:web
