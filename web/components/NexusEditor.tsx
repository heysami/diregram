import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { Eye, EyeOff } from 'lucide-react';

interface Props {
  doc: Y.Doc;
}

export function NexusEditor({ doc }: Props) {
  const [text, setText] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    const yText = doc.getText('nexus');
    setText(yText.toString());
    const observer = () => setText(yText.toString());
    yText.observe(observer);
    return () => yText.unobserve(observer);
  }, [doc]);

  return (
    <div
      className={`mac-window flex flex-col h-full transition-all duration-300 ${
        isVisible ? 'w-[420px] max-w-[calc(100vw-2rem)]' : 'w-12 items-center'
      }`}
    >
      <div className="mac-titlebar">
        <div className="mac-title">{isVisible ? 'Source' : 'Src'}</div>
        <div className="absolute right-1 top-1/2 -translate-y-1/2">
          <button
            type="button"
            onClick={() => setIsVisible(!isVisible)}
            className="mac-btn"
            title={isVisible ? 'Hide Markdown' : 'Show Markdown'}
          >
            {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      
      {isVisible && (
        <div className="flex-1 w-full flex flex-col overflow-hidden">
          <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wide text-gray-500 border-b bg-gray-50/80">
            Main chart definition
          </div>
          <textarea 
            className="flex-1 w-full p-4 font-mono text-sm resize-none focus:outline-none bg-transparent border-b border-gray-200"
            value={text}
            readOnly
            placeholder="Markdown source..."
          />
          <div className="px-4 py-2 text-[10px] uppercase tracking-wide text-gray-500 bg-gray-50 border-t">
            Below the `---` separator in this markdown, you&apos;ll see the
            &nbsp;<span className="font-semibold">Condition Dimension Descriptions</span> section,
            which links Flow/Table descriptions back to their hub nodes.
          </div>
        </div>
      )}
    </div>
  );
}
