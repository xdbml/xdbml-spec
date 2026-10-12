@echo off
setlocal
REM xDBML 0.7.0: merge dev/0.7 into main, release, publish the VS Code
REM extension. Three steps, each run from cmd.exe at the repo root:
REM
REM   apply.cmd            gate, commit this delivery, open the pull request
REM   apply.cmd release    merge the pull request, release 0.7.0, tag v0.7
REM   apply.cmd vscode     publish the VS Code extension 0.7.0
REM
REM Each step stops at the first failure and says what to do next. APPLY.txt
REM describes the three steps.
set "VER=0.7.0"
set "BRANCH=dev/0.7"
set "PRTITLE=xDBML 0.7: DBML 10.3.1 baseline"
set "PRBODY=PR-0.7.md"
set "VSIX=xdbml-0.7.0.vsix"
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
REM  Step 1: gate, commit this delivery, open the pull request
REM ===========================================================================
echo.
echo ============================================================
echo  Step 1 of 3: gate, commit, pull request %BRANCH% into main
echo ============================================================
echo.
echo [1/5] Checks: GitHub CLI, branch, remote, working tree
call :needgh || exit /b 1
for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
if not "%CUR%"=="%BRANCH%" (
  echo ERROR: the clone is on branch %CUR%. Run: git checkout %BRANCH%
  exit /b 1
)
call git fetch origin --quiet || goto :fail
for /f %%h in ('git rev-parse HEAD') do set "LOCAL=%%h"
for /f %%h in ('git rev-parse origin/%BRANCH%') do set "REMOTE=%%h"
if not "%LOCAL%"=="%REMOTE%" (
  echo ERROR: %BRANCH% differs from origin/%BRANCH%. Pull or push first.
  exit /b 1
)
call git merge-base --is-ancestor origin/main HEAD
if errorlevel 1 (
  echo ERROR: main has commits that %BRANCH% lacks. Merge them first:
  echo        git merge origin/main
  exit /b 1
)
set "OTHERS=0"
for /f %%s in ('git status --porcelain ^| find /v "apply.cmd" ^| find /v "APPLY.txt" ^| find /v "%PRBODY%" ^| find /v "tools/release.cmd" ^| find /v "tools/RELEASE.md" ^| find /c /v ""') do set "OTHERS=%%s"
if not "%OTHERS%"=="0" (
  echo ERROR: %OTHERS% uncommitted changes outside this delivery. Commit or
  echo        stash them first:
  git status --short
  exit /b 1
)
echo   ok

echo.
echo [2/5] Verification gate: npm run check, mcp type-check
call npm run check || goto :fail
cd /d "%ROOT%mcp" || goto :fail
call npm run type-check || goto :fail
cd /d "%ROOT%"

echo.
echo [3/5] Commit and push this delivery
call git add -- apply.cmd APPLY.txt tools/release.cmd tools/RELEASE.md || goto :fail
call git diff --cached --quiet
if errorlevel 1 (
  call git commit -m "0.7.0: deployment script; release.cmd tags a minor release vX.Y" || goto :fail
) else (
  echo   nothing to commit: the delivery is committed already.
)
call git push origin %BRANCH% || goto :fail

echo.
echo [4/5] Pull request %BRANCH% into main
set "PRSTATE="
for /f %%s in ('gh pr view %BRANCH% --json state --jq .state 2^>nul') do set "PRSTATE=%%s"
if "%PRSTATE%"=="OPEN" goto :prready
if "%PRSTATE%"=="MERGED" goto :prready
if not exist "%PRBODY%" (
  echo ERROR: %PRBODY%, the description of the pull request, is missing.
  exit /b 1
)
call gh pr create --base main --head %BRANCH% --title "%PRTITLE%" --body-file "%PRBODY%" || goto :fail
:prready
REM The description now lives in the pull request. Removing the file keeps
REM the tree clean for the release, whose last step commits with git add -A.
if exist "%PRBODY%" del "%PRBODY%"
set "PRURL="
for /f "delims=" %%u in ('gh pr view %BRANCH% --json url --jq .url') do set "PRURL=%%u"

echo.
echo [5/5] Done.
echo ============================================================
echo  Pull request: %PRURL%
echo.
echo  CI runs on it, on Node 22 and 24. Read it on GitHub; edit
echo  the description there if you want. Then run:
echo.
echo    apply.cmd release
echo ============================================================
exit /b 0

REM ===========================================================================
REM  Step 2: merge the pull request, release 0.7.0, tag v0.7
REM ===========================================================================
:release
echo.
echo ============================================================
echo  Step 2 of 3: merge into main, release %VER%, tag v0.7
echo ============================================================
echo.
echo [1/6] Checks: GitHub CLI, pull request
call :needgh || exit /b 1
REM gh pr list finds the pull request even once GitHub has deleted its branch.
set "PRSTATE="
for /f %%s in ('gh pr list --head %BRANCH% --state all --json state --jq ".[0].state" 2^>nul') do set "PRSTATE=%%s"
if "%PRSTATE%"=="MERGED" (
  echo   the pull request is merged already.
  goto :merged
)
if not "%PRSTATE%"=="OPEN" (
  echo ERROR: no open pull request from %BRANCH%. Run apply.cmd first.
  exit /b 1
)
echo   ok

echo.
echo [2/6] Wait for the checks of the pull request, then merge it
call gh pr checks %BRANCH% --watch || goto :failchecks
call gh pr merge %BRANCH% --merge || goto :fail
:merged

echo.
echo [3/6] Switch to main, pull, check the line endings
REM A squash merge leaves no commit of %BRANCH% in main, so the merge is
REM checked through the pull request above, not through the history.
call git fetch origin --quiet || goto :fail
call git checkout main || goto :fail
call git pull --ff-only origin main || goto :fail
REM The tests read text files byte for byte and need LF line endings, which
REM .gitattributes asks for. Files that git checked out with CRLF before that
REM rule existed are checked out again, which changes nothing in the index.
call :crlf
if not errorlevel 1 goto :lfok
set "DIRTY=0"
for /f %%s in ('git status --porcelain ^| find /c /v ""') do set "DIRTY=%%s"
if not "%DIRTY%"=="0" (
  echo ERROR: the text files have CRLF line endings, and %DIRTY% changes are
  echo        uncommitted. Commit or stash them, then rerun apply.cmd release.
  exit /b 1
)
echo   the text files have CRLF line endings: checking them out again with LF
call git rm -r --cached -q . || goto :fail
call git reset --hard -q || goto :fail
call :crlf
if not errorlevel 1 goto :lfok
echo ERROR: the text files still have CRLF line endings. .gitattributes needs
echo        the line   * text=auto eol=lf   before the rules for *.cmd.
exit /b 1
:lfok
echo   ok

echo.
echo [4/6] Preflight
call tools\release-preflight.cmd %VER% || goto :fail

echo.
echo [5/6] Release date in the CHANGELOG
node -e "const fs=require('fs');const f='CHANGELOG.md';const s=fs.readFileSync(f,'utf8');const n=new Date();const d=new Date(n.getTime()-n.getTimezoneOffset()*60000).toISOString().slice(0,10);const r=s.replace('**Released**: unreleased','**Released**: '+d);if(r===s){console.log('  the release date is set already.')}else{fs.writeFileSync(f,r);console.log('  v0.7 released '+d)}" || goto :fail

echo.
echo [6/6] tools\release.cmd %VER%
call tools\release.cmd %VER% || goto :failrelease

echo.
echo ============================================================
echo  Done: %VER% is published and deployed, v0.7 is tagged and
echo  released.
echo    https://github.com/xdbml/xdbml-spec/releases/tag/v0.7
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
:crlf
REM Errorlevel 1 when the grammar test corpus has CRLF line endings.
node -e "process.exit(require('fs').readFileSync('grammar/test-cases.md','utf8').includes('\r')?1:0)"
exit /b

:needgh
where gh >nul 2>&1
if errorlevel 1 (
  echo ERROR: the GitHub CLI is not installed. Install it once:
  echo        winget install GitHub.cli   then   gh auth login
  exit /b 1
)
call gh auth status >nul 2>&1
if errorlevel 1 (
  echo ERROR: the GitHub CLI is not logged in. Run: gh auth login
  exit /b 1
)
exit /b 0

:fail
cd /d "%ROOT%"
echo.
echo The command above failed, and its output names the cause. Fix it and
echo rerun the same step. Send me the output if the cause is not clear.
exit /b 1

:failchecks
cd /d "%ROOT%"
echo.
echo A check of the pull request failed or was cancelled. Open the pull
echo request on GitHub, fix the cause on %BRANCH%, push, then rerun:
echo   apply.cmd release
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
