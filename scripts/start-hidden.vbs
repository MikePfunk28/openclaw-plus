Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "M:\betterAI"
WshShell.Run "node server/index.mjs", 0, False
