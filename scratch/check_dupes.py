import re

def find_duplicates(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # Find functions
    functions = re.finditer(r'function\s+(\w+)\s*\(.*?\)\s*\{', content)
    # Also find arrow functions assigned to const/let
    arrows = re.finditer(r'(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(.*?\)\s*=>\s*\{', content)
    
    # This is a very rough way to find "scopes"
    # We'll just look for blocks of code between { and }
    
    # But a simpler way: find all const declarations and their line numbers
    consts = re.finditer(r'^\s*(?:const|let|var)\s+(\w+)\s*=', content, re.MULTILINE)
    
    # Group by function/scope
    # Since we can't easily parse JS scope with regex, we'll just check for duplicates 
    # that are "close" to each other or in the same large block.
    
    all_decls = []
    for match in consts:
        name = match.group(1)
        line = content.count('\n', 0, match.start()) + 1
        all_decls.append((name, line))
        
    # Find names that appear multiple times
    names = [d[0] for d in all_decls]
    duplicates = set([n for n in names if names.count(n) > 1])
    
    for name in duplicates:
        if name in ['const', 'let', 'var', 'if', 'for', 'while']: continue
        lines = [d[1] for d in all_decls if d[0] == name]
        print(f"Name '{name}' declared on lines: {lines}")

find_duplicates('js/init.js')
