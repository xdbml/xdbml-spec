@echo off
setlocal
REM TablePartial injection applied: effective fields in the parser, the renderer and the playground.
REM Run from the repo root after unzipping the delivery there. apply.cmd copies
REM nothing: it checks the unzipped files, then runs the verification gate. It
REM does not commit or push: the last lines print the commands for that.
set "ROOT=%~dp0"
cd /d "%ROOT%" || exit /b 1
set BASE=59ac805
set EDITED=APPLY.txt apply.cmd CHANGELOG.md grammar/xDBML.g4 mcp/src/reference.ts parser/src/constraints.ts parser/src/index.ts parser/src/name-resolver.ts parser/src/partials.ts parser/src/supertypes.ts parser/test/run-tests.ts playground/src/components/inspector/EntityInspector.vue playground/src/components/inspector/FieldInspector.vue playground/src/components/inspector/Inspector.vue playground/src/components/inspector/ast-lookup.ts playground/test/run-tests.ts public/llms.txt renderer/src/layout/layout.ts renderer/test/run-tests.ts spec/v0.6.md

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
call :sum APPLY.txt a77cbb284ecdad1fef80594778ad1c90a713c272 || exit /b 1
call :sum CHANGELOG.md 1ebecde1fb873e254c94d660da440bcbe0b06678 || exit /b 1
call :sum grammar/xDBML.g4 2c99adb43a8725e6b960275e90b5fb1ca71045bf || exit /b 1
call :sum mcp/src/reference.ts c007e2812efe08a47c7ce4e9c42e86e11c3ce4c4 || exit /b 1
call :sum parser/src/constraints.ts 89fdb3cb45364c71ff8ac4f7a114b950571be88f || exit /b 1
call :sum parser/src/index.ts e2b71e75ef50bfdbbcd1dc3018b597648e692207 || exit /b 1
call :sum parser/src/name-resolver.ts 766f8649fbb6f989bb2eb032462ca175469124ed || exit /b 1
call :sum parser/src/partials.ts 55e1f2247cccfeb919c34ef78c82689cca2d022c || exit /b 1
call :sum parser/src/supertypes.ts 21a93aa62ea12bc227d23d6e68de010592123071 || exit /b 1
call :sum parser/test/run-tests.ts 47581eb28afe83beb81d20991d0c5c838d386e07 || exit /b 1
call :sum playground/src/components/inspector/EntityInspector.vue e4ff8b3141bb52b9c009c4f48817163875db5d3e || exit /b 1
call :sum playground/src/components/inspector/FieldInspector.vue e5b67b2471b207cac4fab2bdbffcf0cc4f0543ff || exit /b 1
call :sum playground/src/components/inspector/Inspector.vue 71eba56726a511ef51296526ed1dcdfb1f3c45ca || exit /b 1
call :sum playground/src/components/inspector/ast-lookup.ts 4e12a5edd4f1bb8e963c2914e3a8bf24ac8445cc || exit /b 1
call :sum playground/test/run-tests.ts 0a815f75775a42bcf3e6c03605902cc237098f1d || exit /b 1
call :sum public/llms.txt 927107215f485b570537f76e5bb3cebb705a7d92 || exit /b 1
call :sum renderer/src/layout/layout.ts 20e20aea4fb07b5a612435a9bde079214c277a0a || exit /b 1
call :sum renderer/test/run-tests.ts dbf89abf0ce1fd6498cfee0d7014e792f5142684 || exit /b 1
call :sum spec/v0.6.md 4888acda25b82476d6d08b3d7d4363afcc9fa2bb || exit /b 1

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
echo    git commit -m "TablePartial injection applied: effective fields in the parser, the renderer and the playground"
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
echo ============================================================
exit /b 1
