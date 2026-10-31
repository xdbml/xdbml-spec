@echo off
setlocal
REM xDBML 0.7.5: one rule for the flags of a relationship.
REM Two steps, each run from cmd.exe at the repo root:
REM
REM   apply.cmd            branch, gate, commit this delivery, open the pull request
REM   apply.cmd release    merge the pull request, release 0.7.5, tag v0.7.5
REM
REM Each step stops at the first failure and says what to do next. APPLY.txt
REM describes the two steps. The VS Code extension does not change in 0.7.5.
set "VER=0.7.5"
set "BRANCH=dev/0.7.5"
set "PRTITLE=xDBML 0.7.5: one rule for the flags of a relationship"
set "PRBODY=PR-0.7.5.md"
set "COMMITMSG=COMMIT-0.7.5.txt"
set "ROOT=%~dp0"
REM The release step runs from a copy of this file in %TEMP% (see :release),
REM which receives the root of the clone as its third argument.
if /i "%~2"=="--from-temp" set "ROOT=%~3"
cd /d "%ROOT%" || exit /b 1
if not exist "parser\src\parser.ts" (
  echo ERROR: run apply.cmd from the root of the xdbml-spec clone.
  exit /b 1
)
if /i "%~1"=="release" goto :release
if not "%~1"=="" (
  echo ERROR: unknown step "%~1". The steps are: apply.cmd, apply.cmd release
  exit /b 1
)

REM ===========================================================================
REM  Step 1: branch, gate, commit this delivery, open the pull request
REM ===========================================================================
echo.
echo ============================================================
echo  Step 1 of 2: branch, gate, commit, pull request into main
echo ============================================================
echo.
echo [1/5] Checks: GitHub CLI, branch
call :needgh || exit /b 1
call git fetch origin --quiet || goto :fail
for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
if "%CUR%"=="%BRANCH%" goto :onbranch
if not "%CUR%"=="main" (
  echo ERROR: the clone is on branch %CUR%. The delivery goes on main:
  echo        git checkout main   then rerun apply.cmd
  exit /b 1
)
for /f %%h in ('git rev-parse HEAD') do set "LOCAL=%%h"
for /f %%h in ('git rev-parse origin/main') do set "REMOTE=%%h"
if not "%LOCAL%"=="%REMOTE%" (
  echo ERROR: main differs from origin/main. Run  git pull --ff-only  then
  echo        rerun apply.cmd. The files of this delivery stay as they are.
  exit /b 1
)
REM The branch starts from main and takes the changes of the working tree,
REM which are this delivery.
call git checkout -b %BRANCH% || goto :fail
:onbranch
call git merge-base --is-ancestor origin/main HEAD
if errorlevel 1 (
  echo ERROR: main has commits that %BRANCH% lacks. Merge them first:
  echo        git merge origin/main
  exit /b 1
)
echo   ok, on %BRANCH%

echo.
echo [2/5] Verification gate: npm run check, mcp type-check
call npm run check || goto :fail
cd /d "%ROOT%mcp" || goto :fail
call npm run type-check || goto :fail
cd /d "%ROOT%"

echo.
echo [3/5] Commit and push this delivery
REM Every change in the tree is this delivery, whatever is committed already:
REM a rerun commits what is left, or nothing, and pushes. The commit message
REM and the description of the pull request are not committed.
call git add -A -- . ":(exclude)%PRBODY%" ":(exclude)%COMMITMSG%" || goto :fail
call git diff --cached --quiet
if not errorlevel 1 (
  echo   nothing to commit: the delivery is committed already.
  goto :push
)
if exist "%COMMITMSG%" (
  call git commit -F "%COMMITMSG%" || goto :fail
) else (
  call git commit -m "%PRTITLE%" || goto :fail
)
:push
call git push -u origin %BRANCH% || goto :fail

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
REM The description now lives in the pull request and the message in the
REM commit. Removing both files leaves the tree clean for the release, whose
REM last step commits with git add -A.
if exist "%PRBODY%" del "%PRBODY%"
if exist "%COMMITMSG%" del "%COMMITMSG%"
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
REM  Step 2: merge the pull request, release 0.7.5, tag v0.7.5
REM ===========================================================================
:release
if /i "%~2"=="--from-temp" goto :releasebody
REM git checkout and git pull below replace apply.cmd in the clone, and
REM cmd.exe reads a running batch file from disk line by line: it would go on
REM in the new content at the old position. The step therefore runs from a
REM copy in %TEMP%, which no git command touches. Without CALL, control passes
REM to the copy and never returns here.
copy /y "%~f0" "%TEMP%\xdbml-apply-%VER%.cmd" >nul || goto :fail
"%TEMP%\xdbml-apply-%VER%.cmd" release --from-temp "%ROOT%"
:releasebody
echo.
echo ============================================================
echo  Step 2 of 2: merge into main, release %VER%, tag v%VER%
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
REM --admin merges once the checks above pass: the rules of main ask for an
REM approving review, and the author of a pull request cannot approve it.
REM --squash, as pull requests #3 to #8 were merged.
call gh pr merge %BRANCH% --squash --admin || goto :fail
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
node -e "const fs=require('fs');const f='CHANGELOG.md';const s=fs.readFileSync(f,'utf8');const n=new Date();const d=new Date(n.getTime()-n.getTimezoneOffset()*60000).toISOString().slice(0,10);const r=s.replace('**Released**: unreleased','**Released**: '+d);if(r===s){console.log('  the release date is set already.')}else{fs.writeFileSync(f,r);console.log('  v%VER% released '+d)}" || goto :fail

echo.
echo [6/6] tools\release.cmd %VER%
call tools\release.cmd %VER% || goto :failrelease

echo.
echo ============================================================
echo  Done: %VER% is published and deployed, v%VER% is tagged and
echo  released.
echo    https://github.com/xdbml/xdbml-spec/releases/tag/v%VER%
echo    https://xdbml.org/spec/v0.7
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
