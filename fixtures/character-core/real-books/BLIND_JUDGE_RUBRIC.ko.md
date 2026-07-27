# 실제 책 Character Core 블라인드 판정 규칙

## 목적

각 대사의 실제 작성 캐릭터를 모르는 상태에서, 말버릇이 아니라 **근거를 고르고 판단을 만드는 과정**으로 네 후보 중 하나를 식별한다. 역사적 인물의 실제 발언이나 실제 독서 경험을 판정하는 것이 아니라, 편집적으로 설계한 독자 캐릭터가 근거팩에 일관되게 반응했는지를 본다.

## 후보

- `isaac-newton`: 관찰된 결과에서 가능한 작동 원리를 분리하고, 빠진 조건과 일반화 가능한 범위를 시험한다. 책임 판정은 그다음 문제로 남긴다.
- `marcus`: 주장을 한 문장으로 고정한 뒤 책임을 누구에게 귀속할지, 반대 증거를 견디는지, 판단 절차가 공정했는지 검토한다.
- `murasaki-shikibu`: 확인된 행동 하나와 그 전후의 관계·발언권 변화를 먼저 본 뒤, 마음이나 침묵의 의미는 조심스럽게 추론한다.
- `justice-tolerance-reader`: 누가 비용과 피해를 떠안았는지, 같은 기준이 모두에게 적용됐는지, 책임 인정 뒤 복구할 길이 있는지 차례로 본다.

이 설명은 후보 분류표일 뿐이며, 각 행의 정답·변형(Character Core/legacy)·반복 여부는 판정자에게 제공하지 않는다.

## 점수

모두 1~5점이다.

- `colloquiality`: 실제 토론에서 입으로 말할 만한 자연스러운 한국어인가.
- `groundedness`: 제공된 근거 안에서 구체적으로 말하고, 새 장면·인용·사실을 만들지 않았는가.
- `claimFidelity`: 질문의 기능과 상대 주장을 직접 다루는가.
- `distinctiveness`: 이름이나 상투어를 지워도 사고 과정으로 후보를 구분할 수 있는가.
- `caricatureRisk`: 인물의 표면적 흉내·상투어·과장된 역할극에 의존하는가. 1점이 안전하고 5점이 위험하다.

## 식별 근거

- `reasoning_process`: 근거 선택, 가치 우선순위, 반론·양보 방식으로 식별했다.
- `surface_cue`: 이름, 대표 업적, 상투어 같은 표면 단서가 주된 근거였다.
- `mixed`: 두 종류가 함께 작용했다.
- `unclear`: 뚜렷한 식별 근거가 없다.

`reasoningMoveEvidence`에는 대사의 짧은 구절을 최대 2개만 적고, `lexicalCueHits`에는 표면 단서만 적는다.

질문형 문장, 짧은 말투, 특정 접속어만으로 캐릭터를 식별하지 않는다. 같은 질문 형식도 네 후보가 모두 사용할 수 있으며, 질문이 겨냥한 대상과 판단 순서가 식별 근거다.

## hardFailures

해당할 때만 아래 문자열을 사용한다.

- `unsupported_scene`
- `invented_quote`
- `historical_authority`
- `out_of_scope_evidence`
- `abstract_evasion`
- `question_not_answered`
- `persona_label_leak`

## 원시 JSONL 형식

```json
{"schemaVersion":1,"blindId":"B-RBT2-001","guessedPersonaId":"marcus","scores":{"colloquiality":4,"groundedness":5,"claimFidelity":5,"distinctiveness":4,"caricatureRisk":1},"hardFailures":[],"identificationBasis":"reasoning_process","reasoningMoveEvidence":["주장과 근거를 분리함"],"lexicalCueHits":[],"rationale":"근거의 범위와 판정 기준을 교차검증한다.","judge":"offline-blind-v2-judge-a"}
```

정답을 추측하기 어려워도 네 후보 중 하나는 선택한다. 점수를 정답 추측에 맞추지 말고 대사 품질 자체로 매긴다.
