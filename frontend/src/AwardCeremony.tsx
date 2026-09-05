import { useEffect, useState } from 'react';
import { createAward, deleteAward, fetchAwards, updateAward } from './api';
import type { Award, ScoreboardEntry } from './types';

interface AwardCeremonyProps {
  contestSlug: string;
  /** round === 'final' 스코어보드 엔트리 (운영자만 조회 가능한 종합 순위). */
  finalScoreboard: ScoreboardEntry[];
}

/** 운영자 전용: 상 이름을 등수에 배정해 두고, 시상식 당일 순서대로 호명·공개하는 화면. */
export function AwardCeremony({ contestSlug, finalScoreboard }: AwardCeremonyProps) {
  const [awards, setAwards] = useState<Award[]>([]);
  const [rank, setRank] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ceremonyOpen, setCeremonyOpen] = useState(false);

  useEffect(() => {
    fetchAwards(contestSlug).then(setAwards).catch(() => setAwards([]));
  }, [contestSlug]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const created = await createAward(contestSlug, Number(rank), title);
      setAwards((prev) => [...prev, created].sort((a, b) => a.rank - b.rank));
      setRank('');
      setTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '상 등록에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(award: Award, newTitle: string) {
    if (!newTitle || newTitle === award.title) return;
    try {
      const updated = await updateAward(award.id, newTitle);
      setAwards((prev) => prev.map((a) => (a.id === award.id ? updated : a)));
    } catch (err) {
      setError(err instanceof Error ? err.message : '상 이름 수정에 실패했습니다');
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteAward(id);
      setAwards((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다');
    }
  }

  return (
    <div>
      <h3 className="section-heading">시상 관리</h3>
      <form className="award-form" onSubmit={handleAdd}>
        <input
          type="number"
          min={1}
          placeholder="등수 (1이 최상위)"
          value={rank}
          onChange={(e) => setRank(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="상 이름 (예: 대상, 최우수상, 창의상)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <button type="submit" disabled={busy}>
          추가
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}

      <div className="award-list">
        {awards.map((award) => (
          <div key={award.id} className="award-row">
            <span className="award-rank">{award.rank}위</span>
            <input
              type="text"
              defaultValue={award.title}
              onBlur={(e) => handleRename(award, e.target.value)}
            />
            <button type="button" onClick={() => handleDelete(award.id)}>
              삭제
            </button>
          </div>
        ))}
        {awards.length === 0 && <p className="empty-hint">등록된 상이 없습니다.</p>}
      </div>

      {awards.length > 0 && (
        <button type="button" className="ceremony-open-btn" onClick={() => setCeremonyOpen(true)}>
          시상식 시작
        </button>
      )}

      {ceremonyOpen && (
        <CeremonyOverlay
          awards={awards}
          finalScoreboard={finalScoreboard}
          onClose={() => setCeremonyOpen(false)}
        />
      )}
    </div>
  );
}

interface CeremonyOverlayProps {
  awards: Award[];
  finalScoreboard: ScoreboardEntry[];
  onClose: () => void;
}

type RevealStage = 'waiting' | 'title' | 'team';

function CeremonyOverlay({ awards, finalScoreboard, onClose }: CeremonyOverlayProps) {
  // 긴장감을 살리려고 등수가 낮은(숫자가 큰) 상부터 시작해 대상(1위)으로 마무리한다.
  const sequence = [...awards].sort((a, b) => b.rank - a.rank);
  const [stepIndex, setStepIndex] = useState(0);
  const [stage, setStage] = useState<RevealStage>('waiting');

  const current = sequence[stepIndex];
  const winner = current ? finalScoreboard.find((e) => e.rank === current.rank) : undefined;
  const isLast = stepIndex === sequence.length - 1;

  function handlePrimaryAction() {
    if (stage === 'waiting') {
      setStage('title');
    } else if (stage === 'title') {
      setStage('team');
    } else if (isLast) {
      onClose();
    } else {
      setStepIndex((i) => i + 1);
      setStage('waiting');
    }
  }

  return (
    <div className="ceremony-overlay" role="dialog" aria-modal="true" aria-label="시상식">
      <button type="button" className="ceremony-close" onClick={onClose} aria-label="시상식 닫기">
        ×
      </button>
      <div className="ceremony-body">
        {stage === 'waiting' && <p className="ceremony-hint">다음 수상자를 호명할 준비가 되면 진행하세요</p>}
        {stage !== 'waiting' && (
          <p key={`title-${stepIndex}`} className="ceremony-award-title reveal">
            {current?.title}
          </p>
        )}
        {stage === 'team' && (
          <p key={`team-${stepIndex}`} className="ceremony-team-name reveal">
            🎉 {winner ? winner.team_name : '순위 정보 없음'} 🎉
          </p>
        )}
      </div>
      <div className="ceremony-controls">
        <span className="ceremony-progress">
          {stepIndex + 1} / {sequence.length}
        </span>
        <button type="button" onClick={handlePrimaryAction}>
          {stage === 'waiting' ? '호명하기' : stage === 'title' ? '수상팀 공개' : isLast ? '시상식 마치기' : '다음 시상'}
        </button>
      </div>
    </div>
  );
}
