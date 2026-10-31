@echo off
setlocal
REM Relationship flags: undirected, inactive and foreign_master read the same
REM way on Refs and Edges, and undirected: true draws its arrows.
REM A tooling change: no spec version, nothing published to npm, no tag.
REM Two steps, each run from cmd.exe at the repo root:
REM
REM   apply.cmd            branch, gate, commit this delivery, open the pull request
REM   apply.cmd release    merge the pull request, bring main up to date
REM
REM Each step stops at the first failure and says what to do next. APPLY.txt
REM describes the two steps.
set "BRANCH=fix/relationship-flags"
set "PRTITLE=Relationship flags read the same way on Refs and Edges"
set "PRBODY=PR-flags.md"
set "COMMITMSG=COMMIT-flags.txt"
set "ROOT=%~dp0"
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
REM commit. Removing both files leaves the tree clean.
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
REM  Step 2: merge the pull request, bring main up to date
REM ===========================================================================
:release
echo.
echo ============================================================
echo  Step 2 of 2: merge into main
echo ============================================================
echo.
echo [1/3] Checks: GitHub CLI, pull request
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
echo [2/3] Wait for the checks of the pull request, then merge it
call gh pr checks %BRANCH% --watch || goto :failchecks
REM --admin merges once the checks above pass: the rules of main ask for an
REM approving review, and the author of a pull request cannot approve it.
REM --squash, as pull requests #3 to #7 were merged.
call gh pr merge %BRANCH% --squash --admin || goto :fail
:merged

echo.
echo [3/3] Switch to main and pull
call git fetch origin --quiet || goto :fail
call git checkout main || goto :fail
call git pull --ff-only origin main || goto :fail
echo   ok

echo.
echo ============================================================
echo  Done: the fix is on main. xdbml.org deploys from main by
echo  itself; once it has, the playground link in APPLY.txt shows
echo  arrows at both ends of three relationships, none on the fourth.
echo.
echo  Nothing is published: @xdbml/parse, @xdbml/render, the MCP
echo  server and the rendering API take the fix at the next release.
echo ============================================================
exit /b 0

REM ===========================================================================
REM  Subroutines and failure messages
REM ===========================================================================
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
