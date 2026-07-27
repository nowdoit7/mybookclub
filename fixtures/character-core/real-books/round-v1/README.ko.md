# 실제 책 Character Core 평가 산출물 안내

## 이번 라운드의 판정

**파이프라인 실행 성공, Character Core 가능성 확인, 최종 벤치마크 채택 보류**다.

- 9권 × 4명 × 5질문 = Character Core 기본 대사 180개
- 실제 legacy 카드가 있는 3명 × 3권 × 5질문 = A/B 대사 45개
- 18개 셀 × 독립 재생성 2회 = 안정성 대사 36개
- 총 261개 대사와 정답을 숨긴 블라인드 판단 261개
- 앱 OpenAI API 호출 없음

전체 Character Core 블라인드 식별률은 78.3%였고 출력 미열람 홀드아웃은 80.0%였다. 그러나 마커스가 55.6%로 캐릭터별 최소 기준 60%를 통과하지 못했고, 근거팩 출처 레지스트리 폐쇄성도 실패했다. 질문 구조가 결론을 유도하고 모든 출력이 거의 같은 두 문장 진술문으로 수렴한 문제도 있어, 이 점수를 배포 준비도의 근거로 사용하면 안 된다.

## 먼저 읽을 문서

1. [종합 전이 평가](REAL_BOOK_TRANSFER_REPORT.ko.md) — 수치, A/B, 홀드아웃, 반복, 혼동 행렬
2. [대화 스타일·오버핏 감사](DIALOGUE_STYLE_OVERFIT_AUDIT.ko.md) — 실제 대사 품질과 회귀 sample ID
3. [근거팩 독립 감사](EVIDENCE_PACK_AUDIT.ko.md) — 출처·판본·질문 유도성
4. [블라인드 판정 규칙](BLIND_JUDGE_RUBRIC.ko.md) — 후보 정의와 점수 기준

## 질문과 대사 원문

- [개발 세트 A — Cosmos, Nicomachean Ethics, Atomic Habits](CORE_DIALOGUES_DEV_A.ko.md)
- [개발 세트 B — The Stranger, 혼모노, Pride and Prejudice](CORE_DIALOGUES_DEV_B.ko.md)
- [출력 미열람 홀드아웃 — 1984, The Murder of Roger Ackroyd, One Hundred Years of Solitude](CORE_DIALOGUES_HOLDOUT.ko.md)
- [legacy A/B 대사](LEGACY_AB_DIALOGUES.ko.md)
- [안정성 반복 대사](STABILITY_REPEAT_DIALOGUES.ko.md)

## 근거팩

- [개발 세트 근거팩 설명](EVIDENCE_PACKS_DEV.ko.md)
- [홀드아웃 근거팩 설명](EVIDENCE_PACKS_HOLDOUT.ko.md)
- `evidence-packs.dev.jsonl`
- `evidence-packs.holdout.jsonl`
- `holdout-lock.json`

## 블라인드 원자료

`blind/` 폴더에서 패킷과 정답표는 의도적으로 분리했다.

- `blind-packets.jsonl`: 판정자에게 제공한 익명 입력
- `blind-packets.batch-a/b/c.jsonl`: 판정자별 87개 묶음
- `blind-judgments.raw-a/b/c.jsonl`: 정답을 보기 전 원시 판단
- `blind-map.private.jsonl`: 별도 보관한 정답표
- `blind-judgments.joined.jsonl`: 판단 완료 후 결합한 분석용 자료

## 다음 라운드 P0

1. `COS-09`의 사실·해석을 분리하고, 누락된 출처 URL과 『오만과 편견』 판본 설명을 고친다.
2. Atomic Habits·『혼모노』·『애크로이드 살인 사건』의 유도 질문을 개방형 선택·감정·관계·행동 질문으로 재균형한다.
3. 보이는 대사에서 `근거팩`, `사용자 발제`, `검증된 작품 사실`을 금지하고 내부 grounding 필드로만 남긴다.
4. 1~3문장 리듬을 허용하고 `respond_to_user`·`directed_rebuttal` 일부에 자연스러운 되묻기와 확인을 넣는다.
5. 마커스가 뉴턴·정의 독자와 같은 결론을 내더라도 책임·반증·절차 중 무엇을 중심에 두는지가 드러나도록 contrastive 검사를 추가한다.
6. 수정 입력을 다시 잠근 뒤 전 매트릭스를 재실행한다. 질문이 바뀌므로 영향 셀만 골라 점수를 이어 붙이지 않는다.
