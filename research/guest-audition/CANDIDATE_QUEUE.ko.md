# 역사적 게스트 후보 대기열

## 상태와 경계

이 문서는 프로덕션 게스트 목록이 아니라, 검증할 묘사 가설을 모은 연구
대기열입니다. 장르군은 한 후보를 오디션할 이유만 제공하며 특정 제목,
작가, 인물, 장면에 대한 등장 자격을 주지 않습니다. 아래 자료가 있어도
가짜 인용문을 만들거나, 역사적 인물이 현대 책을 실제로 읽었다고 말하거나,
유명인의 권위를 정답처럼 사용할 수는 없습니다.

동결된 A/B 케이스가 이미 있는 후보만 Round 1 순위를 부여합니다. 이 순위는
역사적 중요도나 프로덕션 승인이 아니라 **현재 테스트 준비도** 순위입니다.

| Round 1 순위 | 후보 | 최신 케이스 | 2차 결과 |
| --- | --- | --- | --- |
| 1 | 아이작 뉴턴 | `three-body-newton-r2` | 반론은 강해졌지만 특징 패턴 과다와 자연스러움 기준에서 탈락했습니다. |
| 2 | 블레즈 파스칼 | `same-as-ever-pascal-r2` | 품질상 선두이며 한 번의 최소 문장·예산 명확화와 재평가가 필요합니다. |
| 3 | 애덤 스미스 | `same-as-ever-adam-smith-r2` | 자연스러워졌지만 너무 일반적이고 책 구체성이 부족했습니다. |

표에 있는 후보도 아직 런타임 승인을 받지 않았습니다. 위 표에 없는 모든 후보의
상태는 **미검증**입니다. 어떤 후보든 런타임 검토
단계로 이동하려면 **친화 장르 안의 서로 성격이 다른 책 최소 2권과 의도적인
장르 불일치 책 1권**으로 블라인드 오디션을 통과해야 합니다. 두 친화 장르
케이스 모두에서 책에 고유한 해석을 더하고, 다른 책의 논점을 유출하지 않으며,
불일치 케이스에서 안전하게 실패해야 합니다. 이 관문을 통과해도 사람의 자료
검토와 권위 편향 검토가 별도로 필요합니다.

## 통제 장르군별 후보

### 1. 문학소설

- **주 후보:** 조지 엘리엇 — **미검증**
- **교체 범주:** 감정형
- **오디션할 문서 기반 렌즈:** 공감을 인지적·도덕적 성취로 보고, 구체적인
  삶에 대한 주의를 사실주의의 기반으로 삼으며, 사적인 판단이 사회적 관계망
  속 결과에 의해 어떻게 교정되는지 살핍니다. 서로 다른 소설을 줄거리나
  작가 전기로 환원하지 않고 깊게 읽을 가능성이 있습니다.
- **가장 큰 묘사/권위 위험:** 빅토리아 시대의 도덕 심판관이 되거나,
  엘리엇과 작품의 서술자를 동일시하거나, 모든 소설에 공감만이 유일한 정답인
  것처럼 말할 수 있습니다.
- **묘사 검토 자료:** [Stanford Encyclopedia of Philosophy: George Eliot](https://plato.stanford.edu/entries/george-eliot/) · [George Eliot Archive](https://georgeeliotarchive.org/)

### 2. 과학소설

- **주 후보:** 아이작 뉴턴 — **Round 1, 1순위; 케이스 1건 존재**
- **교체 범주:** 분석형
- **오디션할 문서 기반 렌즈:** 관찰된 관계와 궁극 원인에 관한 가설을
  구별하고, 적은 수의 증거로 일반 법칙을 얼마나 멀리 주장할 수 있는지
  따지며, 성공한 설명도 반대 현상에 의해 수정될 수 있게 둡니다. 서로 다른
  과학소설에서 추론, 기제, 규모, 과학 권위를 시험할 수 있습니다.
- **가장 큰 묘사/권위 위험:** ‘뉴턴’이라는 이름 때문에 추측성 물리학이
  검증된 사실처럼 들리거나, 모든 토론이 역학 강의로 변하거나, 과학적 명성이
  다른 독자의 말을 압도할 수 있습니다.
- **묘사 검토 자료:** [Newton Project: General Scholium](https://www.newtonproject.ox.ac.uk/view/texts/normalized/NATP00056) · [Stanford Encyclopedia of Philosophy: Newton's Philosophy](https://plato.stanford.edu/entries/newton-philosophy/)

### 3. 판타지/신화

- **주 후보:** J. R. R. 톨킨 — **미검증**
- **교체 범주:** 맥락형
- **오디션할 문서 기반 렌즈:** 판타지를 의도적인 2차 세계 만들기로 보고,
  낯설게 보기를 통해 일상의 현실을 회복하며, 슬픔을 지우지 않는 위안을
  살핍니다. 모든 작품을 중간계와 비교하지 않고 낯선 신화·판타지 구조를
  밝힐 수 있는지 시험해야 합니다.
- **가장 큰 묘사/권위 위험:** 톨킨의 명성이 판타지의 정의를 지나치게
  좁히고, 저작권 있는 문체나 문장 모방을 부르며, 장르의 문지기처럼 작동할
  수 있습니다.
- **묘사 검토 자료:** [University of Oxford English Faculty: *The Lord of the Rings* teaching pack](https://media.podcasts.ox.ac.uk/engfac/fantasy_lit/LordoftheRingsTeachingPack.pdf) · [The Tolkien Estate: Life](https://www.tolkienestate.com/life/)

### 4. 미스터리/범죄

- **주 후보:** 체사레 베카리아 — **미검증**
- **교체 범주:** 분석형
- **오디션할 문서 기반 렌즈:** 잘못을 입증하는 일과 처벌의 사회적 목적을
  구별하고, 비례성·예방 가능한 피해·제도적 대응이 막으려는 폭력보다 더 큰
  폭력을 만드는지 살핍니다. 탐정의 확신과 처벌 중심 결말을 모두 압박할 수
  있습니다.
- **가장 큰 묘사/권위 위험:** 법철학 강의가 인물과 형식을 밀어내거나,
  상상 속 베카리아가 현대 범죄학자 또는 정의의 최종 판관처럼 취급될 수
  있습니다.
- **묘사 검토 자료:** [U.S. Office of Justice Programs: *On Crimes and Punishments*](https://www.ojp.gov/ncjrs/virtual-library/abstracts/crimes-and-punishments) · [Online Library of Liberty: *An Essay on Crimes and Punishments*](https://oll.libertyfund.org/titles/beccaria-an-essay-on-crimes-and-punishments)

### 5. 로맨스

- **주 후보:** 제인 오스틴 — **미검증**
- **교체 범주:** 맥락형
- **오디션할 문서 기반 렌즈:** 구애를 애정, 돈, 법, 계급, 자기 인식,
  아이러니가 함께 작용하는 과정으로 읽습니다. 감정적 중요성을 무시하지
  않으면서 로맨스의 선택을 물질적으로 구체화할 수 있습니다.
- **가장 큰 묘사/권위 위험:** 가짜 오스틴식 재치만 반복하거나, 섭정 시대의
  결혼 제약을 보편화하거나, 하나의 정전으로 모든 로맨스를 판단할 수 있습니다.
- **묘사 검토 자료:** [Jane Austen's Fiction Manuscripts Digital Edition](https://janeausten.ac.uk/) · [Jane Austen Society of North America: The Marriage Law of Jane Austen's World](https://jasna.org/publications-2/persuasions-online/vol36no1/bailey/)

### 6. 호러/고딕

- **주 후보:** 메리 셸리 — **미검증**
- **교체 범주:** 감정형
- **오디션할 문서 기반 렌즈:** 창조자가 자신이 세상에 내놓은 존재에 어떤
  책임을 지는지, 버림과 사회적 배제가 어떻게 괴물성을 만드는지, 야망이
  돌봄을 어디서 회피하는지 묻습니다. 창조자-피조물 줄거리가 없는 고딕·호러
  책에서도 시험해야 합니다.
- **가장 큰 묘사/권위 위험:** 모든 책을 『프랑켄슈타인』에 과적합하거나,
  전기적 설명을 지어내거나, 유명한 한 작품을 장르 전체의 권위로 만들 수
  있습니다.
- **묘사 검토 자료:** [Shelley-Godwin Archive: *Frankenstein* manuscripts](https://shelleygodwinarchive.org/contents/frankenstein/) · [U.S. National Endowment for the Humanities: Shelley-Godwin Archive](https://www.neh.gov/explore/the-shelley-godwin-archive)

### 7. 역사/정치

- **주 후보:** 투키디데스 — **미검증**
- **교체 범주:** 맥락형
- **오디션할 문서 기반 렌즈:** 공개적으로 제시된 불만과 그 아래의 원인을
  나누고, 충돌하는 목격담을 검토하며, 공포·명예·이익·권력·수사가 집단의
  결정을 어떻게 바꾸는지 살핍니다. 서술형 역사와 정치적 주장 모두를 압박할
  수 있습니다.
- **가장 큰 묘사/권위 위험:** 이른바 ‘투키디데스적’ 현실주의를 영원한
  법칙처럼 제시하거나, 권력 정치를 정상화하거나, 엘리트·군사 기록 밖의
  사람을 지울 수 있습니다.
- **묘사 검토 자료:** [MIT Internet Classics Archive: *History of the Peloponnesian War*, Book I](https://classics.mit.edu/Thucydides/pelopwar.1.first.html) · [Encyclopaedia Britannica: Thucydides](https://www.britannica.com/biography/Thucydides-Greek-historian)

### 8. 과학/자연

- **주 후보:** 알렉산더 폰 훔볼트 — **미검증**
- **교체 범주:** 맥락형
- **오디션할 문서 기반 렌즈:** 표본 하나를 기후, 지리, 문화, 인간 행동과
  분리하지 않고 서로 연결된 규모들을 오가며 자연을 관찰합니다. 서로 다른
  자연과학 책에서 과학적 증거를 생태적·사회적 결과와 잇는 데 도움이 될 수
  있습니다.
- **가장 큰 묘사/권위 위험:** 탐험 과학을 낭만화하고 식민지적 추출을
  지나치거나, ‘모든 것은 연결되어 있다’를 아무 책에나 맞는 모호한 답으로
  만들 수 있습니다.
- **묘사 검토 자료:** [Smithsonian Institution: Who Was Alexander von Humboldt?](https://www.smithsonianmag.com/smithsonian-institution/who-was-alexander-von-humboldt-180974473/) · [Smithsonian Institution: Humboldt's influence](https://www.si.edu/support/impact/humboldt)

### 9. 철학/종교

- **주 후보:** 블레즈 파스칼 — **Round 1, 2순위; 인접 장르 케이스 1건 존재**
- **교체 범주:** 분석형
- **오디션할 문서 기반 렌즈:** 불확실성 아래의 엄격한 추론과 자신에게
  유리한 판단 틀에 대한 의심을 함께 사용하고, 이성이 선택을 비교할 수는
  있어도 어떤 가치와 궁극적 헌신을 택할지까지 해결하지 못하는 경계를
  표시합니다. 모든 책을 내기로 환원해서는 안 됩니다.
- **가장 큰 묘사/권위 위험:** 파스칼의 내기가 반복되는 한 가지 기술이 되고,
  종교 변증이나 17세기의 주장을 중립적 논리처럼 몰래 들여올 수 있습니다.
- **묘사 검토 자료:** [Stanford Encyclopedia of Philosophy: Blaise Pascal](https://plato.stanford.edu/entries/pascal/) · [MacTutor History of Mathematics: Blaise Pascal](https://mathshistory.st-andrews.ac.uk/Biographies/Pascal/)

### 10. 심리/자기계발

- **주 후보:** 윌리엄 제임스 — **미검증**
- **교체 범주:** 분석형
- **오디션할 문서 기반 렌즈:** 주의, 습관, 의지, 살아 있는 경험, 실용적
  결과를 연결하되 같은 것으로 보지 않고, 어떤 믿음이 실제 행동을 무엇으로
  바꾸는지 묻습니다. 작가나 독자를 진단하지 않으면서 자기계발의 약속을
  시험할 수 있습니다.
- **가장 큰 묘사/권위 위험:** 현대 상담가처럼 말하거나, 실용적 탐구를
  ‘효과가 있으면 참’으로 축소하거나, 근거 없는 개인 조언에 과학적 권위를
  부여할 수 있습니다.
- **묘사 검토 자료:** [Stanford Encyclopedia of Philosophy: William James](https://plato.stanford.edu/entries/james/) · [Harvard Library: Modern History of Science Collections](https://library.harvard.edu/collections/modern-history-science-collections)

### 11. 비즈니스/경제

- **주 후보:** 애덤 스미스 — **Round 1, 3순위; 케이스 1건 존재**
- **교체 범주:** 맥락형
- **오디션할 문서 기반 렌즈:** 신중함을 정의·공감과 함께 놓고, 공정한
  관찰자의 위치에서 결정을 살피며, 사적 이익과 다른 사람에게 피해를
  노출하는 제도적 규칙을 구별합니다. 스미스를 이기심의 구호로 축소하는
  통념을 피할 수 있습니다.
- **가장 큰 묘사/권위 위험:** 유명한 이름이 경제 논쟁을 끝내거나,
  ‘보이지 않는 손’만 반복하거나, 18세기 도덕철학을 완성된 현대 정책 조언으로
  잘못 번역할 수 있습니다.
- **묘사 검토 자료:** [University of Glasgow: *The Theory of Moral Sentiments*](https://www.gla.ac.uk/explore/adamsmith300/explorelearn/ideas/keyworks/theoryofmoralsentiments/) · [Stanford Encyclopedia of Philosophy: Smith's Moral and Political Philosophy](https://plato.stanford.edu/entries/smith-moral-political/)

### 12. 전기/회고록

- **주 후보:** 플루타르코스 — **미검증**
- **교체 범주:** 맥락형
- **오디션할 문서 기반 렌즈:** 선택과 작은 일화에서 한 생애의 성격을 읽고,
  실제로 다른 삶과 비교해 그 성격을 시험합니다. 짝을 이루는 비교 방식은
  일화를 중립적 사실로 취급하지 않으면서 회고록의 자기 서사가 무엇을
  선택하고 빠뜨렸는지 드러낼 수 있습니다.
- **가장 큰 묘사/권위 위험:** 도덕적 비교가 사회 조건을 평평하게 만들고,
  엘리트의 ‘위대한 생애’를 우선하며, 기억에 남는 일화를 검증된 역사처럼
  반복할 수 있습니다.
- **묘사 검토 자료:** [Stanford Encyclopedia of Philosophy: Plutarch](https://plato.stanford.edu/entries/plutarch/) · [Perseus Digital Library: Plutarch and the *Parallel Lives*](https://www.perseus.tufts.edu/hopper/text?doc=Perseus%3Atext%3A1999.04.0104%3Aentry%3Dplutarchus-bio-1)

### 13. 시/희곡

- **주 후보:** 에밀리 디킨슨 — **미검증**
- **교체 범주:** 감정형
- **오디션할 문서 기반 렌즈:** 압축, 침묵, 구두점, 단어 선택의 이형,
  죽음·시간·믿음·자아에 대한 단순해 보이는 정의의 불안정성에 주목합니다.
  모방시를 만드는 대신 모호함 곁에 머물도록 도와야 합니다.
- **가장 큰 묘사/권위 위험:** 생성 대사가 가짜 디킨슨 시 또는 인용문이
  되거나, 알아보기 쉬운 압축 문체가 실제 토론을 대신하는 의상이 될 수
  있습니다.
- **묘사 검토 자료:** [Harvard Library: The Emily Dickinson Collection](https://library.harvard.edu/collections/emily-dickinson-collection) · [Poetry Foundation: Emily Dickinson](https://www.poetryfoundation.org/poets/emily-dickinson)

### 14. 아동/청소년

- **주 후보:** 한스 크리스티안 안데르센 — **미검증**
- **교체 범주:** 감정형
- **오디션할 문서 기반 렌즈:** 어린 독자와 성인 독자에게 동시에 말하는
  층위를 보존하고, 사회적 배제와 변신에 주목하며, 고통을 단순한 교훈으로
  바꾸지 않습니다. 책이 착한 행동에 상을 주는 데 그치지 않고 어린 독자의
  복잡성을 존중하는지 시험할 수 있습니다.
- **가장 큰 묘사/권위 위험:** 부드럽게 각색된 판본을 원전에 덧씌우거나,
  거짓으로 유아적인 말투를 연기하거나, 19세기의 도덕·종교 가정을 보편적
  아동의 진실처럼 다룰 수 있습니다.
- **묘사 검토 자료:** [University of Southern Denmark: Hans Christian Andersen biography](https://andersen.sdu.dk/liv/biografi/index_e.html) · [Royal Danish Library: The fairy-tale author Hans Christian Andersen](https://www.kb.dk/en/inspiration/book-festival-royal-danish-library/fairy-tale-author-hans-christian-andersen)

## 의도적으로 넣지 않은 것

- 정확한 제목, 작가, 인물, 장면 허용 목록.
- 한 후보가 한 장르를 소유한다는 주장. 비교 오디션을 통과할 때만 대기열을
  늘립니다.
- 생성한 역사적 인용문, 문체 모방, 현대 책을 실제로 읽었다는 주장.
- 이 문서만을 근거로 하는 런타임 선택, 초상화, 프롬프트, SPEC 변경.
