# 실제 책 Character Core 전이 평가

> 생성 방식: Codex 서브 에이전트 오프라인 생성. 앱 OpenAI API 호출 없음.
>
> 역사적 인물이 실제로 현대 책을 읽었다는 주장이 아니라, 제공된 근거팩에 반응하는 편집적 재구성입니다.

## 실행 무결성

- 근거팩: 9권 (개발 6, 홀드아웃 3)
- 출력: 총 261개 = Character Core 기본 180 + legacy A/B 45 + 안정성 반복 36
- 블라인드 판단: 261개
- 홀드아웃 프로토콜: v2 output-unseen locked holdout
- 한계: Book titles and evidence-pack construction were known before generation. Character Core v2, dialogue policy, question prompts, and evidence packs were frozen before any v2 dialogue output was generated.
- 고정 입력 해시: 11/11 일치
- 잠금 후 정정: 없음
- 질문·근거 연결: 통과
- 출처 URL 폐쇄성: 통과

## 핵심 결과

- Character Core 전체 블라인드 식별률: 91.1%
- 사고 과정만으로 식별한 행의 정확도: 91.1% (180개)
- 개발 세트: 89.2% / 출력 미열람 홀드아웃: 95.0%
- 홈 조합 20개: 95.0% / 비홈 조합 160개: 90.6%
- 안정성 반복 식별률: 83.3%
- 기본 대사와 반복 대사의 평균 5-gram Jaccard: 0.079 (높을수록 문장 복제 가능성도 있으므로 식별률과 함께 해석)

## 알려진 대화 품질 경고

- 보이는 대사에 내부 근거 관리 용어가 나온 발화: 0/261
- 실제 물음표가 있는 발화: 24/261
- 문장 수 분포: 1문장 44개, 2문장 157개, 3문장 60개
- 이 수치는 블라인드 점수와 별개다. 식별률이 높더라도 전부 같은 길이의 진술문이면 실제 독서 모임 대사 품질을 통과한 것으로 보지 않는다.

## 반복 안정성

| 캐릭터 | 선택된 r0 정답 | r1·r2 정답 | 반복 식별률 |
|---|---:|---:|---:|
| isaac-newton | 4/4 | 8/8 | 100.0% |
| marcus | 3/4 | 8/8 | 100.0% |
| murasaki-shikibu | 5/5 | 8/10 | 80.0% |
| justice-tolerance-reader | 5/5 | 6/10 | 60.0% |

## 캐릭터별

| 캐릭터 | 정답 | 식별률 | 근거성 | 개성 | 희화화 위험 |
|---|---:|---:|---:|---:|---:|
| isaac-newton | 38/45 | 84.4% | 5.00 | 4.58 | 1.20 |
| marcus | 40/45 | 88.9% | 5.00 | 4.53 | 1.60 |
| murasaki-shikibu | 41/45 | 91.1% | 5.00 | 4.60 | 1.02 |
| justice-tolerance-reader | 45/45 | 100.0% | 4.93 | 4.80 | 1.62 |

## 책별

| 책 | 세트 | 정답 | 식별률 |
|---|---|---:|---:|
| Cosmos | development | 19/20 | 95.0% |
| Nicomachean Ethics | development | 19/20 | 95.0% |
| Atomic Habits | development | 18/20 | 90.0% |
| The Stranger | development | 18/20 | 90.0% |
| 혼모노 | development | 19/20 | 95.0% |
| Pride and Prejudice | development | 14/20 | 70.0% |
| 1984 | holdout | 20/20 | 100.0% |
| The Murder of Roger Ackroyd | holdout | 18/20 | 90.0% |
| One Hundred Years of Solitude | holdout | 19/20 | 95.0% |

## 질문 기능별

| 질문 기능 | 정답 | 식별률 | 구어성 | 개성 |
|---|---:|---:|---:|---:|
| first_impression | 33/36 | 91.7% | 4.42 | 4.72 |
| evidence_selection | 35/36 | 97.2% | 4.17 | 4.67 |
| respond_to_user | 32/36 | 88.9% | 4.36 | 4.50 |
| directed_rebuttal | 29/36 | 80.6% | 4.28 | 4.64 |
| revise_after_counterevidence | 35/36 | 97.2% | 4.08 | 4.61 |

## Character Core 혼동 행렬

행은 실제 캐릭터, 열은 판정 캐릭터다.

| 실제 \ 판정 | isaac-newton | marcus | murasaki-shikibu | justice-tolerance-reader |
|---|---:|---:|---:|---:|
| isaac-newton | 38 | 2 | 4 | 1 |
| marcus | 2 | 40 | 0 | 3 |
| murasaki-shikibu | 1 | 0 | 41 | 3 |
| justice-tolerance-reader | 0 | 0 | 0 | 45 |

## Character Core 대 legacy 카드 — 공통 45셀

| 변형 | 식별률 | 구어성 | 근거성 | 주장 충실도 | 개성 | 희화화 위험 |
|---|---:|---:|---:|---:|---:|---:|
| Character Core | 91.1% | 4.24 | 5.00 | 4.91 | 4.42 | 1.31 |
| Legacy card | 84.4% | 4.24 | 4.87 | 4.93 | 4.16 | 1.27 |

## 판정자별 보정 확인

| 판정자 | 행 | 전체 정답률 | 근거성 | 개성 | 희화화 위험 |
|---|---:|---:|---:|---:|---:|
| offline-blind-v2-judge-a | 87 | 88.5% | 4.91 | 4.41 | 1.33 |
| offline-blind-v2-judge-b | 87 | 95.4% | 4.99 | 4.54 | 1.67 |
| offline-blind-v2-judge-c | 87 | 82.8% | 5.00 | 4.67 | 1.02 |

- Hard failure: question_not_answered 1건

## 판정 경계

- 이 평가는 책 전체 이해도가 아니라 제공된 근거팩을 바탕으로 한 반응의 정확성과 캐릭터 전이를 측정합니다.
- 장르당 한 권 수준이므로 장르 일반화를 입증하지 않습니다. 여기서는 “9권 도전 배터리”라고 부릅니다.
- 생성자와 판정자는 서로 다른 서브 에이전트지만 같은 모델 계열일 수 있어 완전히 독립된 인간 평가가 아닙니다.
- legacy 비교에는 기존 카드가 실제로 존재하는 뉴턴·마커스·무라사키만 포함했습니다. 정의·관용 독자는 억지 baseline을 만들지 않았습니다.
- 원문 전문을 넣지 않았고 짧은 근거 요약만 썼습니다. 저작권 안전성과 전체 독서 대체 금지를 우선했습니다.

## 검증

- 모든 필수 검증 통과
