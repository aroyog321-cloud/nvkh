@echo off
setlocal
cd /d "%~dp0"
title Mission Control Groundstation

where node.exe >nul 2>nul
if errorlevel 1 goto missing_node

for /f %%V in ('node.exe -p "Number(process.versions.node.split('.')[0])"') do set "MISSION_NODE_MAJOR=%%V"
if %MISSION_NODE_MAJOR% LSS 20 goto unsupported_node
if %MISSION_NODE_MAJOR% GTR 22 goto unsupported_node

if not exist "node_modules\.bin\electron.cmd" goto install_dependencies
if not exist "node_modules\node-pty\build\Release\pty.node" goto install_dependencies
goto launch

:install_dependencies
echo.
echo Mission Control is preparing its Windows desktop runtime.
echo This one-time setup can take several minutes.
echo.
call npm.cmd install
if errorlevel 1 goto install_failed

:launch
echo.
echo Opening the real Groundstation desktop app...
echo Do not open mission-control-prototype.html; it is a static reference only.
echo.
call npm.cmd run groundstation -- %*
if errorlevel 1 goto launch_failed
exit /b 0

:missing_node
echo.
echo Node.js was not found. Install Node.js 22 LTS, then run this file again.
echo https://nodejs.org/
goto failed

:unsupported_node
echo.
echo Mission Control requires Node.js 20 or 22 LTS.
echo Detected major version: %MISSION_NODE_MAJOR%
echo Install Node.js 22 LTS, then run this file again.
goto failed

:install_failed
echo.
echo Windows runtime setup failed. Review the npm error above.
echo node-pty may require the Microsoft C++ Build Tools if a prebuilt binary is unavailable.
goto failed

:launch_failed
echo.
echo Groundstation could not open. Review the error above.
goto failed

:failed
echo.
pause
exit /b 1
