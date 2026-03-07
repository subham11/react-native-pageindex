import { useState } from 'react';
import type { TreeNode } from 'react-native-pageindex';

interface TreeNodeProps {
  node: TreeNode;
  depth?: number;
}

function TreeNodeItem({ node, depth = 0 }: TreeNodeProps) {
  const hasChildren = Array.isArray(node.children) && (node.children as TreeNode[]).length > 0;
  const [open, setOpen] = useState(depth < 2);

  const title = (node.title as string | undefined) ?? 'Untitled';
  const summary = (node.summary as string | undefined) ?? (node.prefix_summary as string | undefined);
  const nodeId = node.node_id as string | undefined;
  const startIdx = node.start_index as number | undefined;
  const endIdx = node.end_index as number | undefined;
  const children = (node.children as TreeNode[] | undefined) ?? [];

  return (
    <div className={`tree-node tree-depth-${depth}`}>
      <div
        className="tree-node-header"
        onClick={() => hasChildren && setOpen(o => !o)}
        style={{ cursor: hasChildren ? 'pointer' : 'default' }}
      >
        {hasChildren ? (
          <span className={`tree-chevron ${open ? 'open' : ''}`}>▶</span>
        ) : (
          <span className="tree-chevron-placeholder" />
        )}

        <span className="tree-node-title">{title}</span>

        <div className="tree-node-meta">
          {nodeId && (
            <span className="badge badge-blue">{nodeId}</span>
          )}
          {startIdx != null && endIdx != null && startIdx !== endIdx && (
            <span className="badge badge-orange">
              pages {startIdx}–{endIdx}
            </span>
          )}
          {hasChildren && (
            <span className="badge badge-green">
              {children.length} {children.length === 1 ? 'child' : 'children'}
            </span>
          )}
        </div>
      </div>

      {summary && (
        <div className="tree-node-summary">{summary}</div>
      )}

      {open && hasChildren && (
        <div className="tree-node-children">
          {children.map((child, i) => (
            <TreeNodeItem
              key={(child.node_id as string | undefined) ?? i}
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
  structure: TreeNode;
}

export default function TreeView({ structure }: Props) {
  return (
    <div className="tree-root">
      <TreeNodeItem node={structure} depth={0} />
    </div>
  );
}
