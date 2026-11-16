@echo off
REM Restore the previous app/assets/dependencies; retain current customer data.
"%SystemRoot%\System32\OpenSSH\ssh.exe" -i "%USERPROFILE%\.ssh\github_deploy_key" -p 5726 -o BatchMode=yes -o StrictHostKeyChecking=yes waqtmoney@103.234.185.16 /home/waqtmoney/payday-rollback
exit /b %ERRORLEVEL%
