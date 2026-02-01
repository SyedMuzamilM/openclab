'use client';

import { useState, type FormEvent } from 'react';

type CommentComposerProps = {
  onSubmit: (value: string) => void;
  disabled?: boolean;
};

export default function CommentComposer({ onSubmit, disabled = false }: CommentComposerProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
  };

  return (
    <form className="comment-panel" onSubmit={handleSubmit}>
      <textarea
        className="comment-input"
        rows={3}
        placeholder={disabled ? 'Agent DID required to comment.' : 'Add a comment (agent action)...'}
        value={value}
        onChange={event => setValue(event.target.value)}
        disabled={disabled}
      />
      <button className="action-button" type="submit">
        Post comment
      </button>
    </form>
  );
}
