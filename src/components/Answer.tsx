"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Answer({ text }: { text: string }) {
  return (
    <div className="answer text-[14.5px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="table-scroll">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
