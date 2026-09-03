import { useState } from 'react';
import { createContest } from './api';
import type { Contest } from './types';

interface ContestFormProps {
  onCreated: (contest: Contest) => void;
  onCancel: () => void;
}

/** `datetime-local` 입력값 형식(YYYY-MM-DDTHH:mm, 로컬 시간)으로 변환. */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** 영문 대회명에서 slug 초안을 만든다. 한글만 있으면 빈 문자열이 되어 직접 입력해야 한다. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function ContestForm({ onCreated, onCancel }: ContestFormProps) {
  const defaultStart = new Date();
  defaultStart.setMinutes(0, 0, 0);
  const defaultEnd = new Date(defaultStart.getTime() + 24 * 60 * 60 * 1000);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState(toLocalInputValue(defaultStart));
  const [endAt, setEndAt] = useState(toLocalInputValue(defaultEnd));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (new Date(endAt) < new Date(startAt)) {
      setError('종료 일시는 시작 일시보다 빨라서는 안 됩니다.');
      return;
    }
    setBusy(true);
    try {
      const contest = await createContest({
        slug,
        name,
        description,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
      });
      onCreated(contest);
    } catch (err) {
      setError(err instanceof Error ? err.message : '대회 생성에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="contest-form" onSubmit={handleSubmit}>
      <h3 className="section-heading">새 대회 만들기</h3>

      <label className="field">
        <span>대회명</span>
        <input
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="2026 교내 해커톤"
          required
          autoFocus
        />
      </label>

      <label className="field">
        <span>URL 식별자 (slug)</span>
        <input
          type="text"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          placeholder="hack-2026"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          title="영문 소문자, 숫자, 하이픈(-)만 사용할 수 있습니다"
          maxLength={80}
          required
        />
        <small>영문 소문자·숫자·하이픈. 만든 뒤에는 바꿀 수 없습니다.</small>
      </label>

      <div className="field-row">
        <label className="field">
          <span>시작</span>
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>종료</span>
          <input
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            required
          />
        </label>
      </div>

      <label className="field">
        <span>설명 (선택)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="참가 대상, 일정, 심사 기준 등"
          rows={3}
        />
      </label>

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        <button type="submit" disabled={busy}>
          {busy ? '만드는 중…' : '대회 만들기'}
        </button>
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
          취소
        </button>
      </div>
    </form>
  );
}
