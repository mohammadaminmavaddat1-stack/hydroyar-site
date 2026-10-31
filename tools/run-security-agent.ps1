$ErrorActionPreference = "Stop"
$tokenPath = Join-Path $env:LOCALAPPDATA "HydroYar\agent-token.txt"
if (-not (Test-Path -LiteralPath $tokenPath)) { throw "HydroYar agent token is unavailable." }
$token = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
if ($token.Length -lt 32) { throw "HydroYar agent token is invalid." }
$url = "https://hydroyar-chat.mohammadaminmavaddat1.workers.dev/security/run"
$result = Invoke-RestMethod -Uri $url -Method Post -Headers @{ "X-HydroYar-Agent-Token" = $token } -ContentType "application/json" -Body "{}" -TimeoutSec 120
$report = $result.report
Write-Host ("SECURITY STATUS: {0}" -f $report.status)
Write-Host ("SCORE: {0}/100  PASSED: {1}  FAILED: {2}  TOTAL: {3}" -f $report.score,$report.passed,$report.failed,$report.total)
Write-Host $report.summary
$report.checks | Where-Object { $_.status -ne "passed" } | Format-Table label,status,detail -AutoSize
