@echo off
setlocal
REM 0.6.5, delta 2: grammar and parser (internal definitions).
REM Copies seventeen files into the repo and runs the verification gate.
REM It does not commit or push: the last lines print the commands for that.
REM Usage:  apply.cmd                 (repo at C:\Repos\Hackolade\xdbml-spec)
REM         apply.cmd D:\path\to\xdbml-spec
set REPO=C:\Repos\Hackolade\xdbml-spec
if not "%~1"=="" set REPO=%~1
set SRC=%~dp0
set BASE=a68fbc2
set EDITED=APPLY.txt apply.cmd CHANGELOG.md grammar/test-cases.md grammar/xDBML.g4 parser/README.md parser/src/ast.ts parser/src/constraints.ts parser/src/index.ts parser/src/module-resolver.ts parser/src/monarch.ts parser/src/name-resolver.ts parser/src/parser.ts parser/test/run-tests.ts
set NEW=grammar/fixtures/crm.xdbml parser/src/definitions.ts parser/src/targets.ts

if not exist "%REPO%\parser\src\parser.ts" (
  echo ERROR: no xdbml-spec repository at %REPO%
  echo        Pass its path: apply.cmd D:\path\to\xdbml-spec
  exit /b 1
)
if /i "%SRC%"=="%REPO%\" (
  echo ERROR: run apply.cmd from the extracted folder, not from the repo.
  exit /b 1
)
if not exist "%SRC%parser\src\definitions.ts" (
  echo ERROR: files are missing next to apply.cmd. Extract the whole folder.
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
git diff --quiet %BASE% -- %EDITED%
if errorlevel 1 (
  echo ERROR: one of these files differs from %BASE%:
  echo        %EDITED%
  echo        Commit, stash or discard that change, then run apply.cmd again.
  exit /b 1
)
for %%F in (%NEW%) do call :absent "%%~F" || exit /b 1

echo.
echo [2/3] Copy the seventeen files
for %%F in (%EDITED% %NEW%) do call :copyone "%%~F" || goto :fail

echo.
echo [3/3] Verification gate (npm run check, mcp type-check)
cd /d "%REPO%" || goto :fail
call npm run check || goto :fail
cd /d "%REPO%\mcp" || goto :fail
call npm run type-check || goto :fail

cd /d "%REPO%"
echo.
echo ============================================================
echo  Done. Gate green. Nothing is committed yet.
echo  To commit and push, from %REPO%:
echo.
echo    git add %EDITED% %NEW%
echo    git commit -m "0.6.5, delta 2: grammar and parser (internal definitions)"
echo    git push
echo ============================================================
exit /b 0

:absent
REM %1 is a repo-relative path with forward slashes; cmd wants backslashes.
set "P=%~1"
set "P=%P:/=\%"
if exist "%REPO%\%P%" (
  echo ERROR: %P% already exists. Delete it, then run apply.cmd again.
  exit /b 1
)
exit /b 0

:copyone
set "P=%~1"
set "P=%P:/=\%"
copy /Y "%SRC%%P%" "%REPO%\%P%" >nul
if errorlevel 1 (
  echo ERROR: could not copy %P%
  exit /b 1
)
exit /b 0

:fail
echo.
echo ============================================================
echo  FAILED in %CD%
echo  Nothing after this point ran, and nothing is committed.
echo  Undo the copy with:
echo    git checkout -- %EDITED%
echo    del %NEW:/=\%
echo ============================================================
cd /d "%REPO%"
exit /b 1
