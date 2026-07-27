# Character Core 실제 도서 개발 세트 근거팩

> 스키마 버전: `1.0.0`  
> 근거팩 개정: `P0-v2`  
> 세트: `development`  
> 대상: 4개 프로토타입 Character Core × 6권 × 5개 질문 = 120개 대사  
> 기계 판독 원본: `evidence-packs.dev.jsonl`

## 1. 목적

이 자료는 캐릭터가 책 전문을 읽었다고 가장하지 않고, **모든 캐릭터에게 동일한 검증·출처 통제 근거팩을 제공했을 때 책과 장르가 달라져도 고유한 판단 과정이 유지되는지** 평가하기 위한 개발 세트다.

이 세트의 6권은 카드 수정 과정에서 반복 사용한다. 이후 홀드아웃 세트 결과를 보기 전까지 여기서 발견한 특정 책의 정답 문구를 Character Core에 넣어서는 안 된다. 수정 대상은 책별 결론이 아니라 관찰 순서, 가치 우선순위, 불확실성 처리, 반론과 양보 방식이어야 한다.

## 2. 책별 구성

| bookId | 책 | 대표 영역 | 앵커 | 질문 | 스포일러 |
|---|---|---|---:|---:|---:|
| `cosmos-carl-sagan` | Carl Sagan, *Cosmos* | 과학 교양 | 12 | 5 | 0 |
| `nicomachean-ethics-aristotle` | Aristotle, *Nicomachean Ethics* | 고전 인문·윤리 | 13 | 5 | 0 |
| `atomic-habits-james-clear` | James Clear, *Atomic Habits* | 자기계발 | 12 | 5 | 0 |
| `the-stranger-albert-camus` | Albert Camus, *The Stranger* | 실존·모호한 소설 | 12 | 5 | 2 |
| `honmono-seong-hae-na` | 성해나, 『혼모노』 | 현대 한국 단편소설집 | 12 | 5 | 2 |
| `pride-and-prejudice-jane-austen` | Jane Austen, *Pride and Prejudice* | 관계·사회 고전소설 | 12 | 5 | 2 |

총 73개 앵커와 30개 질문이다.

## 3. 근거 등급

- `verified_source`: 공식 출판사, 저자 공식 자료, 권위 있는 도서관·백과사전·학술 백과에서 확인한 요약 정보다.
- `public_domain_text`: 공개 도메인 원문에서 확인한 사건·논지다. 현대 번역본의 표현과 같다고 가정하지 않는다.
- `user_provided`: 사용자가 실제 세션에서 남긴 발제나 저장소 기록이다. 사용자의 경험을 보존하지만 외부 검증된 작품 사실로 승격하지 않는다.
- `interpretive`: 확인된 사건·논지를 연결한 해석이다. 가능한 독해이지 작품의 유일한 정답이 아니다.
- `uncertain`: 단정하면 안 되는 정보다. 이번 개발 세트에서는 별도 `uncertainties`에 주로 기록했다.

캐릭터의 대사는 사용할 앵커의 등급을 구분해야 한다. 특히 `user_provided`는 “사용자가 이렇게 읽었다/질문했다”라고 귀속하고, `interpretive`는 “이렇게 읽을 수 있다”는 수준을 지킨다.

## 4. 다섯 질문의 고정 기능

모든 책은 같은 기능의 질문 다섯 개를 갖는다.

1. `first_impression`: 책의 첫 감상을 캐릭터의 고유한 판단 순서로 구성한다.
2. `evidence_selection`: 여러 근거 중 무엇을 우선하는지 드러낸다.
3. `respond_to_user`: 사용자의 해석을 정확히 귀속하고 동의·수정·반박한다.
4. `directed_rebuttal`: 다른 독자의 구체적 주장에 직접 답한다.
5. `revise_after_counterevidence`: 새 반대 근거 뒤 무엇을 유지하고 무엇을 양보하는지 본다.

`requiredAnchorIds`는 답변이 반드시 다뤄야 할 후보 또는 핵심 근거다. `counterEvidenceIds`는 다섯 번째 질문에서 기존 판단을 흔드는 새 근거다. 답변은 ID를 소리 내 읽을 필요는 없지만 평가 로그에는 실제 사용한 ID를 남겨야 한다.

## 5. 책별 평가 의도

### 5.1 *Cosmos*

주요 출처:

- [Penguin Random House 도서 소개](https://www.penguinrandomhouse.com/books/159730/cosmos-by-carl-sagan/)
- [Library of Congress, Cosmos: An Appreciation](https://www.loc.gov/item/cosmos000052/)
- [Library of Congress, Carl Sagan 연구·교육·소통 소개](https://www.loc.gov/collections/finding-our-place-in-the-cosmos-with-carl-sagan/articles-and-essays/carl-sagan-and-the-tradition-of-science/carl-sagan-researcher-educator-communicator-advocate-and-activist/)

평가 초점:

- 과학자 캐릭터가 유리한 주제에서 직업 표식만 반복하지 않는가
- 과학사·생명·의식·문명·우주 탐사를 서로 다른 판단 기준으로 연결하는가
- 우주적 규모를 곧바로 “인간은 작다”라는 한 문장으로 축소하지 않는가
- 경이로운 문체와 사실 검증의 수준을 구분하는가

주의: LOC의 Sagan 문서는 TV 프로젝트의 목적도 다룬다. 이를 책의 특정 장이나 직접 인용으로 바꾸면 안 된다. 출판사에 실린 약 140억 년 표현도 최신 우주론을 독립 검증하는 수치로 사용하지 않는다.

### 5.2 *Nicomachean Ethics*

주요 출처:

- [MIT Internet Classics Archive 목차](https://classics.mit.edu/Aristotle/nicomachaen.html)
- [MIT Book I](https://classics.mit.edu/Aristotle/nicomachaen.1.i.html)
- [MIT Book III](https://classics.mit.edu/Aristotle/nicomachaen.3.iii.html)
- [MIT Book V](https://classics.mit.edu/Aristotle/nicomachaen.5.v.html)
- [Project Gutenberg 서지](https://www.gutenberg.org/ebooks/8438)
- [Project Gutenberg HTML](https://www.gutenberg.org/files/8438/8438-h/8438-h.htm)
- [Stanford Encyclopedia of Philosophy 해설](https://plato.stanford.edu/entries/aristotle-ethics/)

평가 초점:

- “중용”을 무조건 중간값으로 오독하지 않는가
- 습관을 생각 없는 반복으로, 실천적 지혜를 추상 규칙으로 축소하지 않는가
- 개인 성품, 타인과의 정의, 친애, 외적 조건을 함께 다루는가
- 공동체적 실천과 관조적 삶 사이의 긴장을 보고 입장을 수정할 수 있는가

주의: eudaimonia, aretê, philia, phronêsis는 번역어 하나로 의미가 완전히 고정되지 않는다. 공개 영어 번역의 문구를 현대 한국어 판본의 직접 문장처럼 재현하지 않는다.

### 5.3 *Atomic Habits*

주요 출처:

- [James Clear 공식 요약](https://jamesclear.com/atomic-habits-summary)
- [목표와 시스템에 관한 저자 글](https://jamesclear.com/goals-systems)
- [습관 변화 3단계에 관한 저자 글](https://jamesclear.com/three-steps-habit-change)
- [정체성 기반 습관에 관한 저자 글](https://jamesclear.com/identity-based-habits)
- [환경과 선택 구조에 관한 저자 글](https://jamesclear.com/choice-architecture)
- [2분 규칙](https://jamesclear.com/how-to-stop-procrastinating)
- [습관 쌓기](https://jamesclear.com/habit-stacking)
- [Goldilocks Rule](https://jamesclear.com/goldilocks-rule)
- [Penguin Random House 도서 소개](https://www.penguinrandomhouse.com/books/543993/atomic-habits-by-james-clear/)

평가 초점:

- 모든 캐릭터가 상투적인 코치로 변하지 않는가
- 목표, 시스템, 정체성, 환경 가운데 무엇을 우선하는지가 캐릭터마다 다른가
- 개인 의지의 중요성을 완전히 지우지 않으면서 환경 설계를 이해하는가
- 실용적 처방을 구조적 문제의 만능 해답으로 과장하지 않는가

주의: 1퍼센트 누적은 설명 모델이지 모든 행동의 보편적 성장 법칙이 아니다. 공식 저자 요약은 핵심 개념의 1차 출처지만 개별 연구의 독립적 재현 검증 자료는 아니다.

### 5.4 *The Stranger*

주요 출처:

- [Penguin Classics 도서 소개](https://www.penguin.co.uk/books/182322/the-outsider-by-camus-albert/9780241458853)
- [Penguin Random House 도서 소개](https://www.penguinrandomhouse.com/books/678110/el-extranjero--the-stranger-by-albert-camus/)
- [Nobel Prize의 Camus 전기](https://www.nobelprize.org/prizes/literature/1957/camus/biographical/)
- [Stanford Encyclopedia of Philosophy의 Camus 해설](https://plato.stanford.edu/entries/camus/)
- 사용자 제공 저장소 기록: `DIALOGUE_QUALITY_REDESIGN_PRD.ko.md` 58~62행

평가 초점:

- 살인 행위, 불분명한 동기, 사회의 감정 규범 판단을 한 덩어리로 만들지 않는가
- 주인공의 소외를 인정하면서 피해자의 비가시성과 가해 책임을 지우지 않는가
- 부조리를 무감정·허무주의·도덕 면책으로 축소하지 않는가
- 사용자의 질문을 작품의 확정 사실이나 다른 독자의 말로 바꾸지 않는가

사용자 제공 앵커 `STR-12`는 David가 실제 세션에서 “다섯 발의 동기가 설명되지 않는다”고 질문했다는 기록이다. 이것은 사용자 발제로만 사용한다. 현재 저장소에 원문 대화나 해당 판본 전문이 없으므로 총격 횟수와 동기 부재를 외부 검증된 사실로 표시하지 않았다.

### 5.5 『혼모노』

주요 출처:

- [창비 공식 도서 소개](https://www.changbi.com/BookDetail?bookid=4525)
- [창비 성해나 작가 소개](https://www.changbi.com/authorDetail?authorid=4880)
- [계간 창작과비평의 소설집 비평](https://magazine.changbi.com/MCQuarterly/Item/7195)
- [계간 창작과비평의 ‘진짜’ 비평](https://magazine.changbi.com/MCQuarterly/Item/7237)
- 사용자 제공 저장소 기록: `DIALOGUE_QUALITY_REDESIGN_PRD.ko.md` 1~6행

평가 초점:

- “진짜 대 가짜”의 단순 대결로 작품을 축소하지 않는가
- 무속, 극우 집회, 국가폭력, 스타트업, 원정 출산을 이국적 소재가 아니라 권력·세대·경제 구조와 연결하는가
- 표제작과 일곱 편의 소설집 전체를 구분하는가
- 출판사 비평의 자본·능력주의 독해를 유력한 해석으로 다루되 유일한 정답으로 강요하지 않는가

사용자 제공 문서는 실제 『혼모노』 세션을 분석했다고 기록하지만, 현재 접근 가능한 저장소에는 그 세션의 전체 대화·독서 메모·작품 감상이 없다. 따라서 `HNM-12`는 “이전 세션의 존재와 자료 부재”만 기록한다. 사용자에게 없는 감상을 만들어 넣어서는 안 된다.

### 5.6 *Pride and Prejudice*

주요 출처:

- [Project Gutenberg #1342 서지](https://www.gutenberg.org/ebooks/1342)
- [Project Gutenberg #1342 HTML — 1894 George Allen 판본 계열, Hugh Thomson 삽화](https://www.gutenberg.org/cache/epub/1342/pg1342-images.html)
- [Library of Congress — 별도의 1917 판본](https://www.loc.gov/item/18001222/)

평가 초점:

- 첫인상과 편견을 단순한 로맨스 장애물이 아니라 증거 수정의 문제로 읽는가
- Elizabeth와 Darcy 가운데 한 사람만 성장했다고 단정하지 않는가
- 결혼을 애정만이 아니라 상속·계급·평판·가족 안전과 함께 보는가
- 편지, 관찰, 비용을 감수한 행동을 서로 다른 증거 유형으로 구분하는가

주의: Project Gutenberg #1342의 HTML은 George Allen이 출판하고 Hugh Thomson이 삽화를 맡은 1894년 판본 계열이다. Library of Congress 자료는 별도로 보존된 1917년 판본이므로 둘을 같은 판본이나 ‘1917 계열 원문’으로 묶지 않는다. 두 공개 원문 모두 현대 한국어 번역본은 아니다. 유명 첫 문장이나 장면을 길게 재현하지 않으며 영화·드라마 각색의 장면을 소설 사실로 섞지 않는다.

## 6. 저작권 및 사용 범위

이 근거팩은 작품 전문이 아니다.

- 저작권 보호 작품인 *Cosmos*, *Atomic Habits*, *The Stranger*, 『혼모노』는 공식 소개·저자 공개 요약·권위 있는 해설을 짧게 재서술했다.
- 직접 인용은 넣지 않았고, 출처 페이지의 홍보 문구나 작품 문장을 복제하지 않았다.
- *Nicomachean Ethics*는 고대 원전과 미국 내 공개본을, *Pride and Prejudice*는 공개 도메인 원문을 참조했다. 영어 번역문의 보호 상태는 관할권에 따라 다를 수 있으므로 평가 대사에서는 어느 쪽도 원문 문구를 재현하지 않는다.
- 판본별 번역 문구를 혼합하거나 기억에 의존해 유명 구절을 완성하지 않는다.
- 캐릭터는 `anchors`의 주장과 사용자가 새로 제공한 감상 범위에서만 작품 사실을 말한다.
- 근거가 없으면 “이 근거팩으로는 확인할 수 없다”고 자연스럽게 한계를 밝혀야 한다.

## 7. 실행 전 검증 체크리스트

- [ ] JSONL이 6줄이며 각 줄이 독립된 JSON 객체로 파싱된다.
- [ ] 각 책의 `set`은 `development`다.
- [ ] 각 책에 10~14개 앵커와 정확히 5개 질문이 있다.
- [ ] 모든 `requiredAnchorIds`와 `counterEvidenceIds`가 같은 책 안에 존재한다.
- [ ] 모든 캐릭터가 같은 책에서는 같은 pack version과 같은 앵커를 받는다.
- [ ] 생성 로그에 사용한 앵커 ID, 불확실성 표현, 근거팩 밖 주장 여부를 남긴다.
- [ ] 『이방인』의 `STR-12`와 『혼모노』의 `HNM-12`를 `verified_source`로 승격하지 않는다.
- [ ] 스포일러 수준 2인 질문과 출력에는 사용자에게 스포일러 경고를 표시한다.
- [ ] 개발 결과를 보고 책별 결론이나 고유명사를 Character Core에 추가하지 않는다.

## 8. 권장 실패 판정

다음 중 하나면 대사 품질 점수와 별개로 하드 실패로 표시한다.

- 근거팩에 없는 사건·장·인용·인물 관계 생성
- `interpretive` 앵커를 작가가 명시한 단 하나의 정답으로 표현
- `user_provided` 앵커를 외부 검증 사실로 표현
- 사용자의 발제를 다른 참여자나 저자의 주장으로 잘못 귀속
- 반대 근거를 받았는데 기존 문장만 반복하고 수정 범위를 밝히지 않음
- 유명 직업어·캐치프레이즈만으로 캐릭터를 표시하고 판단 과정은 동일함
- 모든 책을 “겸손해야 한다”, “균형이 중요하다” 같은 같은 결론으로 평탄화

이 문서는 개발 세트의 근거와 경계를 설명하는 감사용 자료다. 실제 평가 입력의 기준은 동일 디렉터리의 JSONL 파일이다.

<!-- EVIDENCE_QUESTIONS_P0_V2:START -->
## 9. P0-v2 질문 원문

아래 문항은 JSONL의 `fiveQuestions`와 동일하다. 답의 결론을 지정하지 않고, 각 책에서 근거 선택·가치와 행동의 충돌·감정과 관계·장면 반응·반증 뒤 수정을 고르게 시험한다.

### Cosmos

- `COS-Q1` · `first_impression`: 우주의 긴 시간과 지구 생명의 위치를 함께 보았을 때 먼저 든 감정이나 태도는 무엇이었나요? 그 반응을 만든 내용을 짚어 첫 감상을 말해 주세요.
- `COS-Q2` · `evidence_selection`: 생명, 의식, 기록, 탐사, 과학사 가운데 당신의 해석을 출발시키는 근거 하나를 고르세요. 다른 후보보다 그것을 먼저 보는 이유도 말해 주세요.
- `COS-Q3` · `respond_to_user`: 한 사용자는 우주적 규모가 겸손함보다 외로움과 불안을 남겼다고 말했습니다. 그 감정을 존중하면서, 책에서 함께 볼 만한 대목을 골라 응답해 주세요.
- `COS-Q4` · `directed_rebuttal`: 다른 독자는 대중에게 경이를 불러일으킨다면 세부적인 확실성의 차이는 중요하지 않다고 말합니다. 그 주장에서 인정할 점과 동의할 수 없는 경계를 직접 밝혀 주세요.
- `COS-Q5` · `revise_after_counterevidence`: 처음에는 이 책의 가치를 먼 우주를 탐사하는 성과에서만 찾았습니다. 기록의 해독, 과학의 역사, 대중의 이해도 탐구의 일부라는 내용을 새로 보았다면 평가를 어떻게 고치겠습니까?

### Nicomachean Ethics

- `NIC-Q1` · `first_impression`: 좋은 삶을 기분이 아니라 오래 반복하는 활동으로 본다는 설명에서, 가장 끌리거나 불편했던 지점은 무엇인가요? 그 이유와 함께 첫 감상을 말해 주세요.
- `NIC-Q2` · `evidence_selection`: 습관, 상황에 맞는 중용, 실천적 지혜 가운데 판단의 출발점이 될 근거 하나를 고르고, 나머지 둘이 그 선택을 어떻게 보완하거나 제한하는지 말해 주세요.
- `NIC-Q3` · `respond_to_user`: 사용자는 덕을 좋은 규칙을 외워 그대로 따르는 일이라고 이해했습니다. 그 설명에서 맞는 부분과 다시 생각할 부분을 구체적인 근거로 나누어 답해 주세요.
- `NIC-Q4` · `directed_rebuttal`: 다른 독자는 좋은 삶을 말하기 전에 친구와 외적 자원을 공정하게 마련하는 일이 우선이며, 개인의 성품 훈련을 강조하면 조건의 불평등을 가릴 수 있다고 말합니다. 이 우려에 직접 답하면서 공동체의 조건과 개인의 실천을 어떻게 연결할지 말해 주세요.
- `NIC-Q5` · `revise_after_counterevidence`: 처음에는 좋은 삶을 오직 타인과 함께하는 실천으로 이해했습니다. 관조적 삶을 높게 평가하는 대목을 새로 고려하면 무엇을 유지하고 무엇을 유보하겠습니까?

### Atomic Habits

- `ATO-Q1` · `first_impression`: 소개된 방법 가운데 실제 생활에서 먼저 시험해 보고 싶은 것 하나와 선뜻 따르기 어려운 것 하나를 고르세요. 그 선택이 이 책에 대한 첫인상을 어떻게 만들었나요?
- `ATO-Q2` · `evidence_selection`: 정체성, 환경 설계, 작은 시작 가운데 당신의 판단을 가장 크게 움직인 근거를 고르고, 그 방법이 잘 맞을 조건도 함께 말해 주세요.
- `ATO-Q3` · `respond_to_user`: 사용자는 이 책을 목표를 세우지 말라는 주장으로 요약했습니다. 그 말이 포착한 점과 놓친 점을 나누어 답해 주세요.
- `ATO-Q4` · `directed_rebuttal`: 다른 독자는 환경을 바꿔 행동을 쉽게 만드는 것은 자기 책임을 피하거나 자신을 속이는 방법이라고 말합니다. 그 걱정에 직접 답하면서 책임과 설계의 경계를 어디에 둘지 말해 주세요.
- `ATO-Q5` · `revise_after_counterevidence`: 처음에는 되고 싶은 사람을 정하면 행동도 자연스럽게 따라온다고 보았습니다. 반복 행동이 정체성을 만들고 환경과 구조도 선택을 제한한다는 내용을 새로 고려하면 판단을 어떻게 수정하겠습니까?

### The Stranger

- `STR-Q1` · `first_impression`: Meursault의 행위와 사회가 그를 판단하는 방식 가운데 어느 쪽이 더 먼저 불편하게 다가왔나요? 두 층위를 섞지 않고 첫 감상을 말해 주세요.
- `STR-Q2` · `evidence_selection`: 장례, 해변의 폭력, 재판, 마지막 자기 인식 가운데 해석의 중심으로 삼을 근거를 고르고, 그 근거만으로 말할 수 없는 것도 함께 밝혀 주세요.
- `STR-Q3` · `respond_to_user`: 사용자 David는 다섯 발의 총성이 왜 이어졌는지 설명되지 않는다고 질문했습니다. 이 질문을 사용자의 문제의식으로 정확히 받아 적고, 확인된 내용과 아직 단정할 수 없는 부분을 나누어 답해 주세요.
- `STR-Q4` · `directed_rebuttal`: 다른 독자는 사회의 감정 규범이 부당했으므로 Meursault를 오직 희생자로 보아야 한다고 말합니다. 사회적 판단의 문제와 그의 가해 행위를 모두 남긴 채 직접 답해 주세요.
- `STR-Q5` · `revise_after_counterevidence`: 처음에는 부조리를 모든 행동이 무의미하고 책임도 없다는 뜻으로 받아들였습니다. 절망에 머무르지 않는 의식적 삶의 가능성을 새로 고려하면 무엇을 철회하고 무엇을 유지하겠습니까?

### 혼모노

- `HNM-Q1` · `first_impression`: 무당의 세대교체, 낯선 공동체의 환대, 건축가의 야망, 지역 공동체의 신뢰 가운데 가장 오래 마음에 남은 상황을 하나 고르세요. 그 장면이 소설집의 첫인상을 어떻게 만들었나요?
- `HNM-Q2` · `evidence_selection`: 서로 다른 단편의 상황 가운데 소설집 전체를 읽는 출발점으로 삼을 하나를 고르고, 다른 작품까지 같은 이야기로 묶지 않기 위해 필요한 경계도 말해 주세요.
- `HNM-Q3` · `respond_to_user`: 사용자는 문수의 흔들림이 안타깝지만 신애기의 등장을 응원하고 싶다고 말했습니다. 두 사람의 관계에서 그 감정이 붙잡은 점과 놓칠 수 있는 점을 함께 짚어 답해 주세요.
- `HNM-Q4` · `directed_rebuttal`: 다른 독자는 「스무드」에서 듀이가 실제로 느낀 환대의 의미를 먼저 지키고 싶으며, 정치적 맥락을 앞세우면 개인의 감정이 지워질 수 있다고 말합니다. 이 우려에 직접 답하면서 소속감과 맥락을 어떻게 함께 읽을지 말해 주세요.
- `HNM-Q5` · `revise_after_counterevidence`: 처음에는 표제작의 ‘진짜’ 문제로 소설집 전체를 설명할 수 있다고 보았습니다. 서로 다른 사회 장면을 다룬 작품들을 새로 고려하면 해석의 범위를 어디까지 줄이거나 넓히겠습니까?

### Pride and Prejudice

- `PNP-Q1` · `first_impression`: Elizabeth의 첫인상과 가족이 놓인 결혼 조건을 함께 보았을 때, 누구의 처지가 가장 먼저 이해되거나 불편하게 느껴졌나요? 그 이유로 첫 감상을 말해 주세요.
- `PNP-Q2` · `evidence_selection`: 편지, Pemberley에서의 관찰, Lydia 사건 가운데 판단을 가장 크게 바꾸는 근거 하나를 고르고, 말·관찰·행동 중 어떤 종류의 증거인지도 말해 주세요.
- `PNP-Q3` · `respond_to_user`: 사용자는 Elizabeth의 빠른 판단이 때로 틀리더라도 그 솔직함과 생기를 좋아한다고 말했습니다. 그 매력을 인정하면서, 관계에서 치르는 비용도 함께 짚어 답해 주세요.
- `PNP-Q4` · `directed_rebuttal`: 다른 독자는 Charlotte가 사랑보다 생활의 안정을 택한 일을 비겁하다고 평가합니다. 당시의 선택 조건과 다른 결혼 사례를 비교해 그 평가에 직접 답해 주세요.
- `PNP-Q5` · `revise_after_counterevidence`: 처음에는 Darcy의 사과를 체면을 위한 말로만 보았습니다. 새로운 관찰과 비용을 감수한 행동을 알게 되면 평가를 어떻게 고치되, 첫 청혼의 문제는 어떻게 남겨 두겠습니까?
<!-- EVIDENCE_QUESTIONS_P0_V2:END -->
