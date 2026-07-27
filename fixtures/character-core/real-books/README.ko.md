# 실제 책 Character Core 평가 산출물 안내

## 이번 라운드의 판정

**Character Core v2 오프라인 전이 평가 통과, 로컬 A/B 실험 승인, 운영 적용 보류**다.

- 9권 × 4명 × 5질문 = Character Core 기본 대사 180개
- 실제 legacy 카드가 있는 3명 × 3권 × 5질문 = A/B 대사 45개
- 18개 셀 × 독립 재생성 2회 = 안정성 대사 36개
- 총 261개 대사와 정답을 숨긴 블라인드 판단 261개
- 앱 OpenAI API 호출 없음

전체 Character Core 블라인드 식별률은 91.1%였고 출력 미열람 홀드아웃은 95.0%였다. 네 캐릭터 모두 최소 기준 60%를 통과했으며 마커스는 88.9%였다. 근거팩 출처 URL 폐쇄성, 질문·근거 연결, 261개 내부 grounding, 문장 리듬, 상호작용 질문 비율도 모두 통과했다.

다만 실제 앱의 긴 세션과 사용자 정정·지목 흐름을 검증한 결과는 아니다. 정의·관용 독자의 반복 식별률은 60%였고, 마커스의 『이방인』 한 답변은 질문의 한계를 다루지 않아 `question_not_answered` 1건이 남았다. 따라서 이 결과는 로컬 실험의 근거이지 운영 배포 승인으로 사용하지 않는다.

## 먼저 읽을 문서

1. [종합 전이 평가](REAL_BOOK_TRANSFER_REPORT.ko.md) — 수치, A/B, 홀드아웃, 반복, 혼동 행렬
2. [대화 스타일·오버핏 감사](DIALOGUE_STYLE_OVERFIT_AUDIT.ko.md) — 실제 대사 품질과 회귀 sample ID
3. [근거팩 독립 감사](EVIDENCE_PACK_AUDIT.ko.md)와 [v2 개정 기록](EVIDENCE_PACK_REVISION_V2.ko.md) — 발견 사항과 완료한 보정
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

## 다음 단계

1. 통과한 Core 중 실제 앱 카드가 있는 마커스·뉴턴·무라사키만 한국어 로컬 실험에 연결한다.
2. `?characterCore=1`과 loopback hostname, 로컬 서버 승인이 모두 있을 때만 활성화한다.
3. 기존 화자·타깃·단계·출력 스키마는 바꾸지 않고 독서 노트와 대사 프롬프트에 최소 Core 조각만 추가한다.
4. 실제 사용자 세션에서 어휘 반복, 직접 반론, 사용자 정정, 지목 대상과 초상화 일치를 함께 확인한다.
5. 운영 적용·push·merge·배포는 별도 승인 전까지 하지 않는다.
