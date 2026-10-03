@echo off
setlocal
REM 0.6.5, delta 1: spec text (internal definitions).
REM Copies four files into the repo and runs the verification gate.
REM It does not commit or push: the last lines print the commands for that.
REM Usage:  apply.cmd                 (repo at C:\Repos\Hackolade\xdbml-spec)
REM         apply.cmd D:\path\to\xdbml-spec
set REPO=C:\Repos\Hackolade\xdbml-spec
if not "%~1"=="" set REPO=%~1
set SRC=%~dp0
set BASE=666eaba
set FILES=APPLY.txt apply.cmd CHANGELOG.md spec/v0.6.md

if not exist "%REPO%\spec\v0.6.md" (
  echo ERROR: no xdbml-spec repository at %REPO%
  echo        Pass its path: apply.cmd D:\path\to\xdbml-spec
  exit /b 1
)
if /i "%SRC%"=="%REPO%\" (
  echo ERROR: run apply.cmd from the extracted folder, not from the repo.
  exit /b 1
)
if not exist "%SRC%spec\v0.6.md" (
  echo ERROR: spec\v0.6.md is missing next to apply.cmd. Extract the whole folder.
  exit /b 1
)
cd /d "%REPO%" || exit /b 1

echo.
echo [1/3] Guards
git merge-base --is-ancestor %BASE% HEAD
if errorlevel 1 (
  echo ERROR: %BASE% is not in the history of HEAD. Run git pull first.
  exit /b 1
)
git diff --quiet %BASE% -- %FILES%
if errorlevel 1 (
  echo ERROR: one of these files differs from %BASE%: %FILES%
  echo        Commit, stash or discard that change, then run apply.cmd again.
  exit /b 1
)

echo.
echo [2/3] Copy the four files
copy /Y "%SRC%APPLY.txt" "%REPO%\APPLY.txt" >nul || goto :fail
copy /Y "%SRC%apply.cmd" "%REPO%\apply.cmd" >nul || goto :fail
copy /Y "%SRC%CHANGELOG.md" "%REPO%\CHANGELOG.md" >nul || goto :fail
copy /Y "%SRC%spec\v0.6.md" "%REPO%\spec\v0.6.md" >nul || goto :fail

echo.
echo [3/3] Verification gate (npm run check)
cd /d "%REPO%" || goto :fail
call npm run check || goto :fail

cd /d "%REPO%"
echo.
echo ============================================================
echo  Done. Gate green. Nothing is committed yet.
echo  To commit and push, from %REPO%:
echo.
echo    git add %FILES%
echo    git commit -m "0.6.5, delta 1: spec text (internal definitions)"
echo    git push
echo ============================================================
exit /b 0

:fail
echo.
echo ============================================================
echo  FAILED in %CD%
echo  Nothing after this point ran, and nothing is committed.
echo  Undo the copy with: git checkout -- %FILES%
echo ============================================================
cd /d "%REPO%"
exit /b 1
