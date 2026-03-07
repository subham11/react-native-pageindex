import { useState } from 'react';
import type { TreeNode } from 'react-native-pageindex';

interface TreeNodeProps {
  node: TreeNode;
  depth?: number;
}

function TreeNodeItem({ node, depth = 0 }: TreeNodeProps) {
  // PageIndexResult uses `nodes` (Python convention) for child nodes
  const kids = node.nodes ?? [];
  const hasKids = kids.length > 0;
  const [open, setOpen] = useState(depth < 2);

  const summary = node.summary ?? node.prefix_summary;

  return (
    <div className={`tree-node tree-depth-${depth}`}>
      <div
        className="tree-node-header"
        onClick={() => hasKids && setOpen(o => !o)}
        style={{ cursor: hasKids ? 'pointer' : 'default' }}
      >
        {hasKids ? (
          <span className={`tree-chevron ${open ? 'open' : ''}`}>▶</span>
        ) : (
          <span className="tree-chevron-placeholder" />
        )}

        <span className="tree-node-title">{node.title ?? 'Untitled'}</span>

        <div className="tree-node-meta">
          {node.node_id && (
            <span className="badge badge-blue">{node.node_id}</span>
          )}
          {node.start_index != null && node.end_index != null && node.start_index !== node.end_index && (
            <span className="badge badge-orange">
              pages {node.start_index}–{node.end_index}
            </span>
          )}
          {hasKids && (
            <span className="badge badge-green">
              {kids.length} {kids.length === 1 ? 'child' : 'children'}
            </span>
          )}
        </div>
      </div>

      {summary && (
        <div className="tree-node-summary">{summary}</div>
      )}

      {open && hasKids && (
        <div className="tree-node-children">
          {kids.map((child, i) => (
            <TreeNodeItem
              key={child.node_id ?? i}
              node={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  // PageIndexResult.structure is TreeNode[]
  structure: TreeNode[];
}

export default function TreeView({ structure }: Props) {
  return (
    <div className="tree-root">
      {structure.map((node, i) => (
        <TreeNodeItem key={node.node_id ?? i} node={node} depth={0} />
      ))}
    </div>
  );
}
