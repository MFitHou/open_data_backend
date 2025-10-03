@echo off
echo ====================================
echo    Open Data Backend Setup Script
echo ====================================
echo.

REM Kiểm tra Node.js
echo Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

echo Node.js version:
node --version

REM Kiểm tra npm
echo Checking npm installation...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: npm is not installed!
    echo Please install npm or reinstall Node.js
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

echo npm version:
npm --version
echo.

REM Cài đặt dependencies
echo Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies!
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

echo.
echo ====================================
echo         Setup completed!
echo ====================================
echo.
echo You can now run the application with:
echo   npm run start:dev    (for development)
echo   npm run start        (for production)
echo.
echo Press any key to continue...
pause >nul