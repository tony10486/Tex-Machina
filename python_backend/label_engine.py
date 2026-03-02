import re
import json
import os
from collections import Counter

class LabelEngine:
    def __init__(self):
        # Patterns
        self.re_label = re.compile(r'\\label\{([^}]+)\}')
        self.re_ref = re.compile(r'\\ref\{([^}]+)\}')
        self.re_section = re.compile(r'\\(section|subsection|subsubsection)\*?\{([^}]+)\}')
        self.re_begin_env = re.compile(r'\\begin\{(equation|align|gather|split|multline|figure|table)\*?\}')
        self.re_end_env = re.compile(r'\\end\{(equation|align|gather|split|multline|figure|table)\*?\}')

    def parse_file(self, filepath):
        if not os.path.exists(filepath):
            return {"status": "error", "message": f"File {filepath} not found"}

        nodes = {}
        edges = []
        ref_counts = Counter()
        
        current_section_id = None
        current_env_label = None
        in_env = False
        env_buffer = []
        labels_in_current_env = []

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                lines = f.readlines()

            for i, line in enumerate(lines):
                line_num = i + 1
                
                # 1. Section Tracking
                sec_match = self.re_section.search(line)
                if sec_match:
                    sec_name = sec_match.group(2)
                    sec_id = f"sec:{sec_name.lower().replace(' ', '_')}"
                    if sec_id not in nodes:
                        nodes[sec_id] = {
                            "id": sec_id,
                            "label": sec_name,
                            "type": "section",
                            "line": line_num,
                            "content": f"\\section{{{sec_name}}}"
                        }
                    current_section_id = sec_id
                    current_env_label = None

                # 2. Env Tracking
                if not in_env:
                    if self.re_begin_env.search(line):
                        in_env = True
                        env_buffer = [line]
                        labels_in_current_env = []
                else:
                    env_buffer.append(line)
                    if self.re_end_env.search(line):
                        in_env = False
                        full_content = "".join(env_buffer).strip()
                        for lbl in labels_in_current_env:
                            if lbl in nodes:
                                nodes[lbl]["content"] = full_content
                        if labels_in_current_env:
                            current_env_label = labels_in_current_env[-1]

                # 3. Label Extraction
                labels = self.re_label.findall(line)
                for lbl in labels:
                    node_type = "generic"
                    if lbl.startswith("eq:"): node_type = "equation"
                    elif lbl.startswith("fig:"): node_type = "figure"
                    elif lbl.startswith("sec:"): node_type = "section"

                    nodes[lbl] = {
                        "id": lbl,
                        "label": lbl,
                        "type": node_type,
                        "line": line_num,
                        "content": line.strip()
                    }
                    
                    if in_env:
                        labels_in_current_env.append(lbl)
                    else:
                        current_env_label = lbl

                # 4. Reference Extraction
                refs = self.re_ref.findall(line)
                if refs:
                    source = None
                    if in_env and labels_in_current_env:
                        source = labels_in_current_env[-1]
                    elif current_env_label:
                        source = current_env_label
                    else:
                        source = current_section_id

                    for r in refs:
                        if source and source != r:
                            edges.append({"from": source, "to": r})
                            ref_counts[r] += 1

            # Add reference counts to nodes
            for node_id in nodes:
                nodes[node_id]["refCount"] = ref_counts[node_id]

            # Final filtering
            valid_node_ids = set(nodes.keys())
            edges = [e for e in edges if e["to"] in valid_node_ids]

            return {
                "status": "success",
                "mainCommand": "labels",
                "nodes": list(nodes.values()),
                "edges": edges
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}
