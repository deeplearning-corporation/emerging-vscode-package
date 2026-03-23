import * as vscode from 'vscode';

// Emerging 语言解释器
class EmergingInterpreter {
    private variables: Map<string, any> = new Map();
    private functions: Map<string, FunctionDefinition> = new Map();
    private output: string[] = [];

    clear() {
        this.variables.clear();
        this.functions.clear();
        this.output = [];
    }

    evaluate(code: string): string {
        this.clear();
        const lines = code.split('\n');
        
        // 第一遍：收集函数定义
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('function')) {
                this.parseFunction(line, i, lines);
            }
        }
        
        // 第二遍：执行代码
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '' || line.startsWith('//') || line.startsWith('/*')) continue;
            
            try {
                this.executeLine(line);
            } catch (error: any) {
                this.output.push(`Error at line ${i + 1}: ${error.message}`);
            }
        }
        
        return this.output.join('\n');
    }
    
    private parseFunction(line: string, lineNum: number, allLines: string[]) {
        const match = line.match(/function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*\{/);
        if (match) {
            const name = match[1];
            const params = match[2].split(',').map(p => p.trim()).filter(p => p);
            
            // 找到函数体
            let body = '';
            let braceCount = 1;
            let currentLine = lineNum + 1;
            
            while (currentLine < allLines.length && braceCount > 0) {
                const currentLineText = allLines[currentLine];
                body += currentLineText + '\n';
                braceCount += (currentLineText.match(/\{/g) || []).length;
                braceCount -= (currentLineText.match(/\}/g) || []).length;
                currentLine++;
            }
            
            this.functions.set(name, { params, body, lineNum });
        }
    }
    
    private executeLine(line: string): any {
        // 变量声明
        const varMatch = line.match(/^(let|var|const)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
        if (varMatch) {
            const value = this.evaluateExpression(varMatch[3]);
            this.variables.set(varMatch[2], value);
            return;
        }
        
        // 变量赋值
        const assignMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
        if (assignMatch && this.variables.has(assignMatch[1])) {
            const value = this.evaluateExpression(assignMatch[2]);
            this.variables.set(assignMatch[1], value);
            return;
        }
        
        // 打印语句
        const printMatch = line.match(/^print\s+(.+)$/);
        if (printMatch) {
            const value = this.evaluateExpression(printMatch[1]);
            this.output.push(String(value));
            return;
        }
        
        // If 语句
        const ifMatch = line.match(/^if\s*\((.+)\)\s*\{/);
        if (ifMatch) {
            const condition = this.evaluateExpression(ifMatch[1]);
            // 简化处理：只执行单行 if
            return;
        }
        
        // 函数调用
        const funcMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)$/);
        if (funcMatch && this.functions.has(funcMatch[1])) {
            const func = this.functions.get(funcMatch[1])!;
            const args = funcMatch[2].split(',').map(a => this.evaluateExpression(a.trim()));
            
            // 创建新的作用域
            const oldVariables = new Map(this.variables);
            func.params.forEach((param, index) => {
                this.variables.set(param, args[index]);
            });
            
            // 执行函数体
            const lines = func.body.split('\n');
            for (const lineText of lines) {
                const trimmed = lineText.trim();
                if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('}')) {
                    this.executeLine(trimmed);
                }
            }
            
            // 恢复作用域
            this.variables = oldVariables;
            return;
        }
        
        // 表达式求值（如果只是表达式）
        if (line && !line.startsWith('//')) {
            return this.evaluateExpression(line);
        }
    }
    
    private evaluateExpression(expr: string): any {
        expr = expr.trim();
        
        // 处理字符串
        if ((expr.startsWith('"') && expr.endsWith('"')) || 
            (expr.startsWith("'") && expr.endsWith("'"))) {
            return expr.slice(1, -1);
        }
        
        // 处理布尔值
        if (expr === 'true') return true;
        if (expr === 'false') return false;
        if (expr === 'null') return null;
        
        // 处理数字
        if (/^-?\d+(\.\d+)?$/.test(expr)) {
            return parseFloat(expr);
        }
        
        // 处理变量
        if (this.variables.has(expr)) {
            return this.variables.get(expr);
        }
        
        // 处理算术表达式
        try {
            // 替换变量
            let evalExpr = expr;
            for (const [name, value] of this.variables) {
                const regex = new RegExp(`\\b${name}\\b`, 'g');
                evalExpr = evalExpr.replace(regex, String(value));
            }
            
            // 安全求值（仅支持基本运算）
            if (/^[\d\s\+\-\*\/\(\)\.]+$/.test(evalExpr)) {
                return Function('"use strict";return (' + evalExpr + ')')();
            }
            
            return evalExpr;
        } catch {
            return expr;
        }
    }
}

interface FunctionDefinition {
    params: string[];
    body: string;
    lineNum: number;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Emerging language extension is now active! 🚀');
    
    // 显示欢迎消息
    vscode.window.showInformationMessage('Emerging Language Extension Activated!');
    
    // 注册运行代码命令
    let runCommand = vscode.commands.registerCommand('emerging.runCode', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }
        
        const document = editor.document;
        if (document.languageId !== 'emerging') {
            vscode.window.showErrorMessage('This is not an Emerging language file (use .emg extension)');
            return;
        }
        
        const code = document.getText();
        const interpreter = new EmergingInterpreter();
        const output = interpreter.evaluate(code);
        
        // 创建或显示输出通道
        let outputChannel = vscode.window.createOutputChannel('Emerging Output');
        outputChannel.clear();
        outputChannel.appendLine('=== Emerging Program Output ===\n');
        outputChannel.appendLine(output);
        outputChannel.appendLine('\n=== Execution Complete ===');
        outputChannel.show();
        
        vscode.window.showInformationMessage('Emerging code executed successfully!');
    });
    
    // 注册显示版本命令
    let versionCommand = vscode.commands.registerCommand('emerging.showVersion', () => {
        vscode.window.showInformationMessage('Emerging Language v0.0.1 - A simple programming language');
    });
    
    // 注册代码补全提供器
    let completionProvider = vscode.languages.registerCompletionItemProvider(
        'emerging',
        {
            provideCompletionItems(document, position, token, context) {
                const linePrefix = document.lineAt(position).text.substr(0, position.character);
                
                const completionItems = [
                    new vscode.CompletionItem('let', vscode.CompletionItemKind.Keyword),
                    new vscode.CompletionItem('const', vscode.CompletionItemKind.Keyword),
                    new vscode.CompletionItem('if', vscode.CompletionItemKind.Keyword),
                    new vscode.CompletionItem('else', vscode.CompletionItemKind.Keyword),
                    new vscode.CompletionItem('for', vscode.CompletionItemKind.Keyword),
                    new vscode.CompletionItem('while', vscode.CompletionItemKind.Keyword),
                    new vscode.CompletionItem('function', vscode.CompletionItemKind.Keyword),
                    new vscode.CompletionItem('print', vscode.CompletionItemKind.Function),
                    new vscode.CompletionItem('return', vscode.CompletionItemKind.Keyword),
                    new vscode.CompletionItem('true', vscode.CompletionItemKind.Constant),
                    new vscode.CompletionItem('false', vscode.CompletionItemKind.Constant),
                    new vscode.CompletionItem('null', vscode.CompletionItemKind.Constant),
                ];
                
                // 添加变量补全
                const text = document.getText();
                const varMatches = text.match(/\b(let|var|const)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g);
                if (varMatches) {
                    varMatches.forEach(match => {
                        const varName = match.split(/\s+/)[1];
                        completionItems.push(
                            new vscode.CompletionItem(varName, vscode.CompletionItemKind.Variable)
                        );
                    });
                }
                
                return completionItems;
            }
        },
        '.', ' ', '(', '"', '\''
    );
    
    // 注册悬停提示提供器
    let hoverProvider = vscode.languages.registerHoverProvider('emerging', {
        provideHover(document, position, token) {
            const wordRange = document.getWordRangeAtPosition(position);
            const word = document.getText(wordRange);
            
            const keywords: { [key: string]: string } = {
                'let': 'Declares a variable',
                'const': 'Declares a constant variable',
                'if': 'Conditional statement',
                'else': 'Else clause for if statement',
                'for': 'For loop',
                'while': 'While loop',
                'function': 'Declares a function',
                'print': 'Outputs a value to console',
                'return': 'Returns a value from a function'
            };
            
            if (keywords[word]) {
                return new vscode.Hover(`**${word}**: ${keywords[word]}`);
            }
            
            return null;
        }
    });
    
    context.subscriptions.push(runCommand, versionCommand, completionProvider, hoverProvider);
}

export function deactivate() {}