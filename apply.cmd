@echo off
setlocal
REM xDBML 0.6.6: TablePartials as in DBML, records column order, release notes.
REM Run from the repo root after unzipping the delivery there. apply.cmd copies
REM nothing: it checks the unzipped files, then runs the verification gate. It
REM does not commit or push: the last lines print the commands for that.
set "ROOT=%~dp0"
cd /d "%ROOT%" || exit /b 1
set BASE=59ac805
set EDITED=APPLY.txt apply.cmd CHANGELOG.md mcp/src/reference.ts parser/src/constraints.ts parser/src/index.ts parser/src/name-resolver.ts parser/src/parser.ts parser/src/partials.ts parser/test/run-tests.ts playground/help/diagnostics-panel.md playground/src/components/inspector/EntityInspector.vue public/llms.txt renderer/src/layout/layout.ts renderer/test/run-tests.ts spec/v0.6.md

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
REM HEAD holds the commit of the TablePartial delivery, alone or followed by the
REM first 0.6.6 archive: each file is, in HEAD, one of the two versions known here.
call :head CHANGELOG.md 1ebecde1fb873e254c94d660da440bcbe0b06678 3c452d38865c654ef6e59d2778cd1aa6e4f579a0 || exit /b 1
call :head mcp/src/reference.ts c007e2812efe08a47c7ce4e9c42e86e11c3ce4c4 64822803b9d4dc6a479e65beff7f5b9270bd6c19 || exit /b 1
call :head parser/src/constraints.ts 89fdb3cb45364c71ff8ac4f7a114b950571be88f 89fdb3cb45364c71ff8ac4f7a114b950571be88f || exit /b 1
call :head parser/src/index.ts e2b71e75ef50bfdbbcd1dc3018b597648e692207 e2b71e75ef50bfdbbcd1dc3018b597648e692207 || exit /b 1
call :head parser/src/name-resolver.ts 766f8649fbb6f989bb2eb032462ca175469124ed 416ba37b974e1a25fedbc19aece9aff8618607a7 || exit /b 1
call :head parser/src/parser.ts be32565e8cf75ae42e0ebe512906f56676d718af 1f3da63716d4257c1cf5ae961780fac4334d3c05 || exit /b 1
call :head parser/src/partials.ts 55e1f2247cccfeb919c34ef78c82689cca2d022c 55e1f2247cccfeb919c34ef78c82689cca2d022c || exit /b 1
call :head parser/test/run-tests.ts 47581eb28afe83beb81d20991d0c5c838d386e07 06b7dbb4f48e73befc4010db911d195c00130ba3 || exit /b 1
call :head playground/help/diagnostics-panel.md 54df7b7e84871114a8b0d9392ab0fbbfc4b5cc2e 3318dd58e78aef4bac2447de8651f1aa917468e1 || exit /b 1
call :head playground/src/components/inspector/EntityInspector.vue e4ff8b3141bb52b9c009c4f48817163875db5d3e e4ff8b3141bb52b9c009c4f48817163875db5d3e || exit /b 1
call :head public/llms.txt 927107215f485b570537f76e5bb3cebb705a7d92 555f557875188547ccb4e2fca9e85876f600a04a || exit /b 1
call :head renderer/src/layout/layout.ts 20e20aea4fb07b5a612435a9bde079214c277a0a 20e20aea4fb07b5a612435a9bde079214c277a0a || exit /b 1
call :head renderer/test/run-tests.ts dbf89abf0ce1fd6498cfee0d7014e792f5142684 dbf89abf0ce1fd6498cfee0d7014e792f5142684 || exit /b 1
call :head spec/v0.6.md 4888acda25b82476d6d08b3d7d4363afcc9fa2bb 46ddaa62b0f3994facd9c3c0b18ff8e089ca200e || exit /b 1
REM Each file holds this delivery's content (apply.cmd itself excepted).
call :sum APPLY.txt 02ce3acd62deef7347458aaa3c0724c64e968645 || exit /b 1
call :sum CHANGELOG.md da7dfb7725d3f7d19920f9df771c10c1d5845a42 || exit /b 1
call :sum mcp/src/reference.ts 3c536b63c3194b747d06fa542ed9cef375d80597 || exit /b 1
call :sum parser/src/constraints.ts faf9eb38525c57f7bbfd809d93a9a045b20d78e4 || exit /b 1
call :sum parser/src/index.ts a4e147787c54e9eb364e3726c7a1a20fc97bd82b || exit /b 1
call :sum parser/src/name-resolver.ts 766f8649fbb6f989bb2eb032462ca175469124ed || exit /b 1
call :sum parser/src/parser.ts 1f3da63716d4257c1cf5ae961780fac4334d3c05 || exit /b 1
call :sum parser/src/partials.ts cb56ec24d5212773a548b35423508598447555a9 || exit /b 1
call :sum parser/test/run-tests.ts 171a7873e30dccfa4c07cd3e8d1afce2f0b54c03 || exit /b 1
call :sum playground/help/diagnostics-panel.md 4a686e738316dc51af4c901ce3326792783dd86a || exit /b 1
call :sum playground/src/components/inspector/EntityInspector.vue f5d39e0d178318f43515746b1f1c4af0ab452dd6 || exit /b 1
call :sum public/llms.txt bfc31e58984374aa2e82355bd71b9df2ad1cc06c || exit /b 1
call :sum renderer/src/layout/layout.ts be2e411731c2a5eb77af94c181279a236db13364 || exit /b 1
call :sum renderer/test/run-tests.ts de868cc558b89558c4b649e5845bea1aa50ee7d3 || exit /b 1
call :sum spec/v0.6.md 0c8a7c06023b737e0921f5237e32e8a48e803f2b || exit /b 1

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
echo  To commit and release, from %ROOT%:
echo.
echo    git add %EDITED%
echo    git commit -m "0.6.6: TablePartials as in DBML, records column order, release notes"
echo    tools\release-preflight.cmd 0.6.6
echo    tools\release.cmd 0.6.6
echo.
echo  release.cmd pushes main and the tag itself: no git push before it.
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

:head
REM %1 is a repo-relative path; %2 and %3 are the blobs HEAD may hold for it:
REM the TablePartial delivery, and the first 0.6.6 archive.
set "B="
for /f %%B in ('git rev-parse "HEAD:%~1" 2^>nul') do set "B=%%B"
if /i "%B%"=="%~2" exit /b 0
if /i "%B%"=="%~3" exit /b 0
echo ERROR: the committed %~1 is not a version this delivery was built on.
echo        HEAD must hold the commit of xdbml-tablepartial-injection.zip, with no
echo        later change to that file. Undo the unzip with git checkout HEAD -- .
echo        and ask for a delivery based on HEAD.
exit /b 1

:fail
cd /d "%ROOT%"
echo.
echo ============================================================
echo  FAILED. Nothing is committed.
echo  To take the delivery back out:
echo    git checkout -- %EDITED%
echo ============================================================
exit /b 1
