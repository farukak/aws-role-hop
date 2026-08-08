import { useRef, type ChangeEvent, type KeyboardEvent, type ReactNode, type UIEvent } from 'react';

interface ImportCodeEditorProps {
  value: string;
  placeholder: string;
  ariaLabel: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}

const CREDENTIAL_KEY =
  /^(aws_access_key_id|aws_secret_access_key|aws_session_token|credential_process|credential_source|web_identity_token_file|sso_token_file)$/i;

export function ImportCodeEditor({
  value,
  placeholder,
  ariaLabel,
  onChange,
  onKeyDown,
}: ImportCodeEditorProps) {
  const highlightRef = useRef<HTMLPreElement>(null);

  function syncScroll(event: UIEvent<HTMLTextAreaElement>): void {
    if (!highlightRef.current) return;
    highlightRef.current.scrollTop = event.currentTarget.scrollTop;
    highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
  }

  return (
    <div className="import-code-editor">
      <pre ref={highlightRef} className="import-code-editor__highlight" aria-hidden="true">
        <code>{highlightImportText(value)}</code>
      </pre>
      <textarea
        className="textarea-input import-textarea import-code-editor__input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        onKeyDown={onKeyDown}
        onScroll={syncScroll}
        aria-label={ariaLabel}
      />
    </div>
  );
}

export function highlightImportText(value: string): ReactNode[] {
  return value.split('\n').map((line, index, lines) => (
    <span className="import-code-line" key={index}>
      {highlightLine(line)}
      {index < lines.length - 1 ? '\n' : null}
    </span>
  ));
}

function highlightLine(line: string): ReactNode {
  if (/^\s*[#;]/.test(line)) {
    return <span className="syntax-token syntax-token--comment">{line}</span>;
  }

  const section = /^(\s*)(\[[^\]]+])(.*)$/.exec(line);
  if (section) {
    return (
      <>
        {section[1]}
        <span className="syntax-token syntax-token--section">{section[2]}</span>
        <span className="syntax-token syntax-token--comment">{section[3]}</span>
      </>
    );
  }

  const assignment = /^(\s*)([A-Za-z_][\w.-]*)(\s*=\s*)(.*)$/.exec(line);
  if (assignment) {
    const credential = CREDENTIAL_KEY.test(assignment[2] ?? '');
    return (
      <>
        {assignment[1]}
        <span
          className={`syntax-token ${credential ? 'syntax-token--credential' : 'syntax-token--key'}`}
        >
          {assignment[2]}
        </span>
        <span className="syntax-token syntax-token--punctuation">{assignment[3]}</span>
        <span className="syntax-token syntax-token--value">{assignment[4]}</span>
      </>
    );
  }

  return highlightJsonLine(line);
}

function highlightJsonLine(line: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  const pattern =
    /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?|\b(?:true|false|null)\b|[{}[\],:]/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line))) {
    if (match.index > cursor) tokens.push(line.slice(cursor, match.index));
    const token = match[0];
    const kind = token.startsWith('"')
      ? /^"(?:\\.|[^"\\])*"(?=\s*:)/.test(token)
        ? 'key'
        : 'string'
      : /^[{}[\],:]$/.test(token)
        ? 'punctuation'
        : 'literal';
    tokens.push(
      <span className={`syntax-token syntax-token--${kind}`} key={`${match.index}-${token}`}>
        {token}
      </span>,
    );
    cursor = pattern.lastIndex;
  }

  if (cursor < line.length) tokens.push(line.slice(cursor));
  return tokens.length ? tokens : [line];
}
