import re
import json
import sys
import os
from collections import Counter

class LatexDependencyParser:
    def __init__(self):
        # Patterns
        self.re_label = re.compile(r'\\label\{([^}]+)\}')
        self.re_ref = re.compile(r'\\ref\{([^}]+)\}')
        self.re_section = re.compile(r'\\(section|subsection|subsubsection)\*?\{([^}]+)\}')
        self.re_begin_env = re.compile(r'\\begin\{(equation|align|gather|split|multline|figure|table)\*?\}')
        self.re_end_env = re.compile(r'\\end\{(equation|align|gather|split|multline|figure|table)\*?\}')

        # State
        self.current_section_id = None
        self.current_env_label = None
        self.in_env = False
        self.env_buffer = []
        self.labels_in_current_env = []

        # Graph Data
        self.nodes = {} 
        self.edges = [] 
        self.ref_counts = Counter() # To track how many times each label is referenced

    def parse(self, filepath):
        if not os.path.exists(filepath):
            return {"error": f"File {filepath} not found"}

        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        for i, line in enumerate(lines):
            line_num = i + 1
            
            # 1. Section Tracking
            sec_match = self.re_section.search(line)
            if sec_match:
                sec_name = sec_match.group(2)
                sec_id = f"sec:{sec_name.lower().replace(' ', '_')}"
                if sec_id not in self.nodes:
                    self.nodes[sec_id] = {
                        "id": sec_id,
                        "label": sec_name,
                        "type": "section",
                        "line": line_num,
                        "content": f"\\section{{{sec_name}}}"
                    }
                self.current_section_id = sec_id
                self.current_env_label = None

            # 2. Env Tracking
            if not self.in_env:
                if self.re_begin_env.search(line):
                    self.in_env = True
                    self.env_buffer = [line]
                    self.labels_in_current_env = []
            else:
                self.env_buffer.append(line)
                if self.re_end_env.search(line):
                    self.in_env = False
                    full_content = "".join(self.env_buffer).strip()
                    for lbl in self.labels_in_current_env:
                        if lbl in self.nodes:
                            self.nodes[lbl]["content"] = full_content
                    if self.labels_in_current_env:
                        self.current_env_label = self.labels_in_current_env[-1]

            # 3. Label Extraction
            labels = self.re_label.findall(line)
            for lbl in labels:
                node_type = "generic"
                if lbl.startswith("eq:"): node_type = "equation"
                elif lbl.startswith("fig:"): node_type = "figure"
                elif lbl.startswith("sec:"): node_type = "section"

                self.nodes[lbl] = {
                    "id": lbl,
                    "label": lbl,
                    "type": node_type,
                    "line": line_num,
                    "content": line.strip()
                }
                
                if self.in_env:
                    self.labels_in_current_env.append(lbl)
                else:
                    self.current_env_label = lbl

            # 4. Reference Extraction
            refs = self.re_ref.findall(line)
            if refs:
                source = None
                if self.in_env and self.labels_in_current_env:
                    source = self.labels_in_current_env[-1]
                elif self.current_env_label:
                    source = self.current_env_label
                else:
                    source = self.current_section_id

                for r in refs:
                    if source and source != r:
                        self.edges.append({"from": source, "to": r})
                        self.ref_counts[r] += 1

        # Add reference counts to nodes
        for node_id in self.nodes:
            self.nodes[node_id]["refCount"] = self.ref_counts[node_id]

        # Final filtering
        valid_node_ids = set(self.nodes.keys())
        self.edges = [e for e in self.edges if e["to"] in valid_node_ids]

        return {
            "nodes": list(self.nodes.values()),
            "edges": self.edges
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file provided"}))
    else:
        parser = LatexDependencyParser()
        result = parser.parse(sys.argv[1])
        print(json.dumps(result, indent=2))
