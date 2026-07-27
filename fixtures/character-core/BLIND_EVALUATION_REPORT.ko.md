# 캐릭터 코어 블라인드 평가

## 방법

`offline-dialogue-log.jsonl`의 60개 항목을 대화 텍스트의 단순 FNV-1a 해시로 결정적 정렬한 뒤 `B001`–`B060`을 부여했다. 첫 판정에서는 `prompt`, `allowedEvidence`, `dialogue`만 읽었고 `personaId`, `caseId`, `selectedValue`, `dialogueMove`, 생성기 메타데이터와 `prototypeCores.ts`는 보지 않았다. 60개 추측·점수·근거를 모두 고정한 후에만 두 번째 기계적 패스로 `personaId`를 결합했다.

## 결과

- 매크로 정확도: **78.33%** (네 인물별 정확도의 단순 평균)
- 전체 정확도: **47/60, 78.33%**
- 추론 과정만 사용한 판정: **26/35, 74.29%** (`identificationBasis = reasoning_process`)

| 실제 인물 | 정답/전체 | 정확도 |
|---|---:|---:|
| `isaac-newton` | 14/15 | 93.33% |
| `marcus` | 11/15 | 73.33% |
| `murasaki-shikibu` | 12/15 | 80.00% |
| `justice-tolerance-reader` | 10/15 | 66.67% |

### 평균 품질 점수

| 항목 | 평균 (1–5) |
|---|---:|
| 구어 자연스러움 (`colloquiality`) | 4.88 |
| 근거 충실도 (`groundedness`) | 5.00 |
| 인물 구별성 (`distinctiveness`) | 4.62 |
| 희화화 위험 (`caricatureRisk`, 낮을수록 좋음) | 1.17 |

## 주요 혼동

- 가장 큰 혼동은 `justice-tolerance-reader → marcus` 4건이었다(B001, B015, B020, B027). 관용의 한계와 복구 전 책임 요구가 명시적 “선 넘기” 표현 없이 나오면 공정한 책임 배분 추론처럼 들렸다.
- `murasaki-shikibu → justice-tolerance-reader`도 3건이었다(B006, B024, B039). 지위 압력과 피해자 자율성을 읽는 관계적 추론이 직접적인 불공정 거부와 겹쳤다.
- `marcus → justice-tolerance-reader`는 2건(B025, B028), 그 밖에 `marcus → isaac-newton` 1건(B057), `marcus → murasaki-shikibu` 1건(B059)이었다. 증거에 따른 책임 배분이 관용의 경계, 반증 중심 추론, 지위 관계 읽기와 각각 맞닿았다.
- `isaac-newton`은 1건만 `murasaki-shikibu`로 혼동됐다(B021). 원본 보관이라는 작은 행동이 관찰 증거이면서 동시에 복종·의심의 관계 신호였기 때문이다.

## 판정

뉴턴의 “관찰→복합 원인→단정 한계”는 가장 안정적으로 식별됐다. 무라사키도 작은 행동, 순서, 지위 비대칭, 신뢰 변화가 함께 드러날 때 선명했다. 반면 마커스와 관용 독자는 모두 불공정과 책임을 다루므로, 관용 독자의 **참아 주는 초기 태도→한계선에서 직접 전환→수리 뒤 완화**라는 시간적 전환이 한 발화 안에 충분히 나타나지 않으면 구별성이 낮아졌다. 모든 발화는 주어진 근거 밖으로 나가지 않았고, 전반적으로 자연스러우며 희화화 위험은 낮았다.
