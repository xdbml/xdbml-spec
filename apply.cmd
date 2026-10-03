@echo off
setlocal
REM Release 0.6.5 (internal definitions): the release date in CHANGELOG.md.
REM Run from the repo root after unzipping the delivery there. apply.cmd copies
REM nothing: it checks the unzipped files, then runs the verification gate. It
REM does not commit or push: the last lines print the commands for that.
set "ROOT=%~dp0"
cd /d "%ROOT%" || exit /b 1
set BASE=e624f51
set EDITED=APPLY.txt apply.cmd CHANGELOG.md

if not exist ".git" (
  echo ERROR: apply.cmd is not at the root of a clone of xdbml-spec.
  echo        Unzip the archive at the repo root, then run apply.cmd there.
  exit /b 1
)
if not exist "parser\src\parser.ts" (
  echo ERROR: %ROOT% does not look like the xdbml-spec repository.
  exit /b 1
)

echo.
echo [1/3] Guards
git merge-base --is-ancestor %BASE% HEAD
if errorlevel 1 (
  echo ERROR: %BASE% is not in the history of HEAD. Run git pull, unzip again, then run apply.cmd.
  exit /b 1
)
git diff --quiet %BASE% HEAD -- %EDITED%
if errorlevel 1 (
  echo ERROR: a commit since %BASE% changed one of this delivery's files, and the unzip
  echo        has overwritten that change. Restore it with git checkout HEAD -- ^<file^>
  echo        and ask for a delivery based on HEAD.
  exit /b 1
)
REM Each file holds this delivery's content (apply.cmd itself excepted).
call :sum APPLY.txt 18fd9aa79e98f0d529eec4d62bcbbca3af33843d || exit /b 1
call :sum CHANGELOG.md 56804a0c8ea6a6f07242cc795fbd4dfba618da55 || exit /b 1

REM The working tree holds no change outside this delivery.
set "LIST=%TEMP%\xdbml-delivery-files.txt"
set "CHANGED=%TEMP%\xdbml-changed-files.txt"
set "EXTRA=%TEMP%\xdbml-extra-files.txt"
(for %%F in (%EDITED%) do @echo %%F) > "%LIST%"
git diff --name-only HEAD > "%CHANGED%"
git ls-files --others --exclude-standard >> "%CHANGED%"
findstr /v /x /l /i /g:"%LIST%" "%CHANGED%" > "%EXTRA%"
for %%S in ("%EXTRA%") do if %%~zS gtr 0 (
  echo ERROR: the working tree holds changes outside this delivery:
  type "%EXTRA%"
  echo        Commit, stash or discard them, then run apply.cmd again.
  exit /b 1
)
echo        Base, contents and working tree as expected.

echo.
echo [2/3] Verification gate (npm run check, mcp type-check)
call npm run check || goto :fail
cd /d "%ROOT%mcp" || goto :fail
call npm run type-check || goto :fail

cd /d "%ROOT%"
echo.
echo [3/3] Done. Gate green. Nothing is committed yet.
echo ============================================================
echo  To commit and push, from %ROOT%:
echo.
echo    git add %EDITED%
echo    git commit -m "0.6.5: release date"
echo    git push
echo.
echo  Then release, from %ROOT%:
echo.
echo    tools\release-preflight.cmd 0.6.5
echo    tools\release.cmd 0.6.5
echo.
echo  and publish the VS Code extension 0.6.5 (see APPLY.txt, step 4).
echo ============================================================
exit /b 0

:sum
REM %1 is a repo-relative path, %2 the blob hash git computes for its content.
set "P=%~1"
set "P=%P:/=\%"
if not exist "%P%" (
  echo ERROR: %P% is missing. Unzip the whole archive at the repo root.
  exit /b 1
)
set "H="
for /f %%H in ('git hash-object "%~1"') do set "H=%%H"
if /i not "%H%"=="%~2" (
  echo ERROR: %P% does not hold this delivery's content. Unzip the archive again.
  exit /b 1
)
exit /b 0

:fail
cd /d "%ROOT%"
echo.
echo ============================================================
echo  FAILED. Nothing is committed.
echo  To take the delivery back out:
echo    git checkout -- %EDITED%
echo ============================================================
exit /b 1
