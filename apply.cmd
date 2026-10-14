@echo off
setlocal
REM xDBML 0.7.1: commit on main, release, publish the VS Code extension.
REM Three steps, each run from cmd.exe at the repo root, on main:
REM
REM   apply.cmd            gate, commit this delivery, push main
REM   apply.cmd release    release 0.7.1, tag v0.7.1
REM   apply.cmd vscode     publish the VS Code extension 0.7.1
REM
REM Each step stops at the first failure and says what to do next. APPLY.txt
REM describes the three steps.
set "VER=0.7.1"
set "MSG=0.7.1: EntityPartial and EntityGroup, color as the header color, x- custom properties"
set "VSIX=xdbml-0.7.1.vsix"
set "ROOT=%~dp0"
cd /d "%ROOT%" || exit /b 1
if not exist "parser\src\parser.ts" (
  echo ERROR: run apply.cmd from the root of the xdbml-spec clone.
  exit /b 1
)
if /i "%~1"=="release" goto :release
if /i "%~1"=="vscode" goto :vscode
if not "%~1"=="" (
  echo ERROR: unknown step "%~1". The steps are: apply.cmd, apply.cmd release, apply.cmd vscode
  exit /b 1
)

REM ===========================================================================
REM  Step 1: gate, commit this delivery, push main
REM ===========================================================================
echo.
echo ============================================================
echo  Step 1 of 3: gate, commit, push main
echo ============================================================
echo.
echo [1/3] Checks: branch, remote
call :onmain || exit /b 1
call git fetch origin --quiet || goto :fail
call git merge-base --is-ancestor origin/main HEAD
if errorlevel 1 (
  echo ERROR: origin/main has commits that your main lacks. Bring them in,
  echo        then rerun apply.cmd:
  echo          git pull --ff-only origin main
  exit /b 1
)
echo   ok

echo.
echo [2/3] Verification gate: npm run check, mcp type-check
call npm run check || goto :fail
cd /d "%ROOT%mcp" || goto :fail
call npm run type-check || goto :fail
cd /d "%ROOT%"

echo.
echo [3/3] Commit and push
REM Every change in the tree is this delivery, whatever is committed
REM already: a rerun commits what is left, or nothing, and pushes.
call git add -A || goto :fail
call git diff --cached --quiet
if errorlevel 1 (
  call git commit -m "%MSG%" || goto :fail
) else (
  echo   nothing to commit: the delivery is committed already.
)
call git push origin main || goto :fail

echo.
echo ============================================================
echo  Done: main is pushed. CI runs on it, on Node 22 and 24.
echo  Then run:
echo.
echo    apply.cmd release
echo ============================================================
exit /b 0

REM ===========================================================================
REM  Step 2: release 0.7.1, tag v0.7.1
REM ===========================================================================
:release
echo.
echo ============================================================
echo  Step 2 of 3: release %VER%, tag v%VER%
echo ============================================================
echo.
echo [1/4] Checks: branch, remote
call :onmain || exit /b 1
call git fetch origin --quiet || goto :fail
set "LOCAL="
set "REMOTE="
for /f %%h in ('git rev-parse HEAD') do set "LOCAL=%%h"
for /f %%h in ('git rev-parse origin/main') do set "REMOTE=%%h"
if not "%LOCAL%"=="%REMOTE%" (
  echo ERROR: main differs from origin/main. Run apply.cmd first, which
  echo        commits and pushes, or git pull --ff-only origin main.
  exit /b 1
)
echo   ok

echo.
echo [2/4] Preflight
call tools\release-preflight.cmd %VER% || goto :fail

echo.
echo [3/4] Release date in the CHANGELOG
node -e "const fs=require('fs');const f='CHANGELOG.md';const s=fs.readFileSync(f,'utf8');const n=new Date();const d=new Date(n.getTime()-n.getTimezoneOffset()*60000).toISOString().slice(0,10);const r=s.replace('**Released**: unreleased','**Released**: '+d);if(r===s){console.log('  the release date is set already.')}else{fs.writeFileSync(f,r);console.log('  v%VER% released '+d)}" || goto :fail

echo.
echo [4/4] tools\release.cmd %VER%
call tools\release.cmd %VER% || goto :failrelease

echo.
echo ============================================================
echo  Done: %VER% is published and deployed, v%VER% is tagged and
echo  released.
echo    https://github.com/xdbml/xdbml-spec/releases/tag/v%VER%
echo    https://xdbml.org/spec/v0.7
echo.
echo  Last step:  apply.cmd vscode
echo ============================================================
exit /b 0

REM ===========================================================================
REM  Step 3: publish the VS Code extension
REM ===========================================================================
:vscode
echo.
echo ============================================================
echo  Step 3 of 3: publish the VS Code extension %VER%
echo ============================================================
cd /d "%ROOT%tools\vscode-extension" || goto :fail
if not exist "%VSIX%" (
  echo ERROR: tools\vscode-extension\%VSIX% is missing.
  cd /d "%ROOT%"
  exit /b 1
)
call npx --yes @vscode/vsce publish --packagePath %VSIX% || goto :failvsce
cd /d "%ROOT%"
echo.
echo ============================================================
echo  Done: the extension is on the Marketplace. It can take a
echo  few minutes to show at
echo    https://marketplace.visualstudio.com/items?itemName=xdbml.xdbml
echo ============================================================
exit /b 0

REM ===========================================================================
REM  Subroutines and failure messages
REM ===========================================================================
:onmain
set "CUR="
for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
if not "%CUR%"=="main" (
  echo ERROR: the clone is on branch %CUR%. 0.7.1 is released from main:
  echo        git checkout main
  exit /b 1
)
exit /b 0

:fail
cd /d "%ROOT%"
echo.
echo The command above failed, and its output names the cause. Fix it and
echo rerun the same step. Send me the output if the cause is not clear.
exit /b 1

:failrelease
cd /d "%ROOT%"
echo.
echo tools\release.cmd stopped. Fix the cause it names, then rerun
echo   tools\release.cmd %VER%
echo directly, not apply.cmd release: release.cmd skips what it already
echo published, while the preflight refuses a version that is on npm.
exit /b 1

:failvsce
cd /d "%ROOT%"
echo.
echo vsce could not publish. Either log in once, with a Personal Access
echo Token of the xdbml publisher, then rerun apply.cmd vscode:
echo   npx @vscode/vsce login xdbml
echo or upload tools\vscode-extension\%VSIX% by hand at
echo   https://marketplace.visualstudio.com/manage/publishers/xdbml
exit /b 1
