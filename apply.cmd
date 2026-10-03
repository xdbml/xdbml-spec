@echo off
setlocal
REM 0.6.5, delta 4: VS Code 0.6.5, llms.txt and the MCP reference (internal definitions).
REM Run from the repo root after unzipping the delivery there. apply.cmd copies
REM nothing: it checks the unzipped files, then runs the verification gate. It
REM does not commit or push: the last lines print the commands for that.
set "ROOT=%~dp0"
cd /d "%ROOT%" || exit /b 1
set BASE=f78776f
set EDITED=APPLY.txt apply.cmd CHANGELOG.md mcp/src/reference.ts parser/src/keywords.ts public/llms.txt tools/textmate/scripts/test.mjs tools/textmate/xdbml.tmLanguage.json tools/vscode-extension/CHANGELOG.md tools/vscode-extension/README.md tools/vscode-extension/package-lock.json tools/vscode-extension/package.json tools/vscode-extension/syntaxes/xdbml.tmLanguage.json
set NEW=tools/vscode-extension/xdbml-0.6.5.vsix

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
git diff --quiet %BASE% HEAD -- %EDITED% %NEW%
if errorlevel 1 (
  echo ERROR: a commit since %BASE% changed one of this delivery's files, and the unzip
  echo        has overwritten that change. Restore it with git checkout HEAD -- ^<file^>
  echo        and ask for a delivery based on HEAD.
  exit /b 1
)
REM Each file holds this delivery's content (apply.cmd itself excepted).

call :sum APPLY.txt d699ac3591acfb9c5598386d3fac6a20d0899e3d || exit /b 1
call :sum CHANGELOG.md 0e1a39b84f120b66409099e40da57b1b89a763b3 || exit /b 1
call :sum mcp/src/reference.ts 043b037f096da65455608abdbed0fb4a9af94f3f || exit /b 1
call :sum parser/src/keywords.ts 4aaec4906b749fc871688185ebd27a6508d5f924 || exit /b 1
call :sum public/llms.txt 615fe270c49567c0864932e9a997778b7f316712 || exit /b 1
call :sum tools/textmate/scripts/test.mjs 925c07b587b52df3f438796a987489fc356c0658 || exit /b 1
call :sum tools/textmate/xdbml.tmLanguage.json 9083a0477facc93a13dc326dc16dbe762c3ae810 || exit /b 1
call :sum tools/vscode-extension/CHANGELOG.md 561fc0d34ab1b8179912bf51498cd3b1c926bf3b || exit /b 1
call :sum tools/vscode-extension/README.md 3e012852b075970a2c34380e8ae6c36002665991 || exit /b 1
call :sum tools/vscode-extension/package-lock.json daa5f8b113dd3d87d12fe717e0ec2c5ed7a40156 || exit /b 1
call :sum tools/vscode-extension/package.json 3ecdf50bc9ff23890a7c5499c52425529daf3eb1 || exit /b 1
call :sum tools/vscode-extension/syntaxes/xdbml.tmLanguage.json 9083a0477facc93a13dc326dc16dbe762c3ae810 || exit /b 1
call :sum tools/vscode-extension/xdbml-0.6.5.vsix 65336219cee57fe47196d232d7e47c9d954fd327 || exit /b 1
REM The working tree holds no change outside this delivery.
set "LIST=%TEMP%\xdbml-delivery-files.txt"
set "CHANGED=%TEMP%\xdbml-changed-files.txt"
set "EXTRA=%TEMP%\xdbml-extra-files.txt"
(for %%F in (%EDITED% %NEW%) do @echo %%F) > "%LIST%"
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
echo [2/3] Verification gate (npm run check, mcp type-check, TextMate test)
call npm run check || goto :fail
cd /d "%ROOT%mcp" || goto :fail
call npm run type-check || goto :fail
cd /d "%ROOT%" || goto :fail
call node tools\textmate\scripts\test.mjs || goto :fail

cd /d "%ROOT%"
echo.
echo [3/3] Done. Gate green. Nothing is committed yet.
echo ============================================================
echo  To commit and push, from %ROOT%:
echo.
echo    git add %EDITED% %NEW%
echo    git commit -m "0.6.5, delta 4: VS Code 0.6.5, llms.txt and the MCP reference (internal definitions)"
echo    git push
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
echo    del %NEW:/=\%
echo ============================================================
exit /b 1
