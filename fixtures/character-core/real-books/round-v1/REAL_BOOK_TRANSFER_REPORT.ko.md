# 실제 책 Character Core 전이 평가

> 생성 방식: Codex 서브 에이전트 오프라인 생성. 앱 OpenAI API 호출 없음.
>
> 역사적 인물이 실제로 현대 책을 읽었다는 주장이 아니라, 제공된 근거팩에 반응하는 편집적 재구성입니다.

## 실행 무결성

- 근거팩: 9권 (개발 6, 홀드아웃 3)
- 출력: 총 261개 = Character Core 기본 180 + legacy A/B 45 + 안정성 반복 36
- 블라인드 판단: 261개
- 홀드아웃 프로토콜: output-unseen locked holdout
- 한계: Book titles and evidence-pack construction were known before generation. Only the holdout dialogue outputs remained unseen after this lock.
- 고정 입력 해시: 6/6 일치
- 잠금 후 정정: stability cell references only (기본·홀드아웃 대사 생성 영향: 없음)
- 질문·근거 연결: 통과
- 출처 URL 폐쇄성: 실패

## 핵심 결과

- Character Core 전체 블라인드 식별률: 78.3%
- 사고 과정만으로 식별한 행의 정확도: 78.3% (180개)
- 개발 세트: 77.5% / 출력 미열람 홀드아웃: 80.0%
- 홈 조합 20개: 95.0% / 비홈 조합 160개: 76.3%
- 안정성 반복 식별률: 72.2%
- 기본 대사와 반복 대사의 평균 5-gram Jaccard: 0.028 (높을수록 문장 복제 가능성도 있으므로 식별률과 함께 해석)

## 알려진 대화 품질 경고

- 보이는 대사에 내부 근거 관리 용어가 나온 발화: 12/261
- 실제 물음표가 있는 발화: 0/261
- 문장 수 분포: 2문장 250개, 3문장 11개
- 이 수치는 블라인드 점수와 별개다. 식별률이 높더라도 전부 같은 길이의 진술문이면 실제 독서 모임 대사 품질을 통과한 것으로 보지 않는다.

## 반복 안정성

| 캐릭터 | 선택된 r0 정답 | r1·r2 정답 | 반복 식별률 |
|---|---:|---:|---:|
| isaac-newton | 4/4 | 8/8 | 100.0% |
| marcus | 3/4 | 7/8 | 87.5% |
| murasaki-shikibu | 5/5 | 6/10 | 60.0% |
| justice-tolerance-reader | 3/5 | 5/10 | 50.0% |

## 캐릭터별

| 캐릭터 | 정답 | 식별률 | 근거성 | 개성 | 희화화 위험 |
|---|---:|---:|---:|---:|---:|
| isaac-newton | 36/45 | 80.0% | 4.98 | 4.51 | 1.00 |
| marcus | 25/45 | 55.6% | 5.00 | 4.53 | 1.04 |
| murasaki-shikibu | 40/45 | 88.9% | 4.93 | 4.89 | 1.00 |
| justice-tolerance-reader | 40/45 | 88.9% | 4.93 | 4.69 | 1.00 |

## 책별

| 책 | 세트 | 정답 | 식별률 |
|---|---|---:|---:|
| Cosmos | development | 17/20 | 85.0% |
| Nicomachean Ethics | development | 16/20 | 80.0% |
| Atomic Habits | development | 14/20 | 70.0% |
| The Stranger | development | 13/20 | 65.0% |
| 혼모노 | development | 16/20 | 80.0% |
| Pride and Prejudice | development | 17/20 | 85.0% |
| 1984 | holdout | 17/20 | 85.0% |
| The Murder of Roger Ackroyd | holdout | 17/20 | 85.0% |
| One Hundred Years of Solitude | holdout | 14/20 | 70.0% |

## 질문 기능별

| 질문 기능 | 정답 | 식별률 | 구어성 | 개성 |
|---|---:|---:|---:|---:|
| first_impression | 27/36 | 75.0% | 4.50 | 4.58 |
| evidence_selection | 30/36 | 83.3% | 4.47 | 4.81 |
| respond_to_user | 25/36 | 69.4% | 4.61 | 4.39 |
| directed_rebuttal | 32/36 | 88.9% | 4.47 | 4.72 |
| revise_after_counterevidence | 27/36 | 75.0% | 4.33 | 4.78 |

## Character Core 혼동 행렬

행은 실제 캐릭터, 열은 판정 캐릭터다.

| 실제 \ 판정 | isaac-newton | marcus | murasaki-shikibu | justice-tolerance-reader |
|---|---:|---:|---:|---:|
| isaac-newton | 36 | 5 | 2 | 2 |
| marcus | 7 | 25 | 1 | 12 |
| murasaki-shikibu | 2 | 0 | 40 | 3 |
| justice-tolerance-reader | 0 | 2 | 3 | 40 |

## Character Core 대 legacy 카드 — 공통 45셀

| 변형 | 식별률 | 구어성 | 근거성 | 주장 충실도 | 개성 | 희화화 위험 |
|---|---:|---:|---:|---:|---:|---:|
| Character Core | 73.3% | 4.51 | 4.96 | 5.00 | 4.58 | 1.02 |
| Legacy card | 84.4% | 4.04 | 5.00 | 5.00 | 4.67 | 1.53 |

## 판정자별 보정 확인

| 판정자 | 행 | 전체 정답률 | 근거성 | 개성 | 희화화 위험 |
|---|---:|---:|---:|---:|---:|
| offline-blind-judge-a | 87 | 75.9% | 4.98 | 4.53 | 1.18 |
| offline-blind-judge-b | 87 | 77.0% | 4.97 | 4.69 | 1.09 |
| offline-blind-judge-c | 87 | 82.8% | 4.98 | 4.75 | 1.02 |

- Hard failure: out_of_scope_evidence 1건

## 판정 경계

- 이 평가는 책 전체 이해도가 아니라 제공된 근거팩을 바탕으로 한 반응의 정확성과 캐릭터 전이를 측정합니다.
- 장르당 한 권 수준이므로 장르 일반화를 입증하지 않습니다. 여기서는 “9권 도전 배터리”라고 부릅니다.
- 생성자와 판정자는 서로 다른 서브 에이전트지만 같은 모델 계열일 수 있어 완전히 독립된 인간 평가가 아닙니다.
- legacy 비교에는 기존 카드가 실제로 존재하는 뉴턴·마커스·무라사키만 포함했습니다. 정의·관용 독자는 억지 baseline을 만들지 않았습니다.
- 원문 전문을 넣지 않았고 짧은 근거 요약만 썼습니다. 저작권 안전성과 전체 독서 대체 금지를 우선했습니다.

## 검증

- 실패: per-persona blind floor: isaac-newton 80.0%, marcus 55.6%, murasaki-shikibu 88.9%, justice-tolerance-reader 88.9%
- 실패: evidence source URL closure mismatch
