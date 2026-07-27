# 실제 도서 근거팩 P0 개정 기록 — v2

작성일: 2026-07-24  
대상: 개발 6권 + 출력 미열람 홀드아웃 3권  
스키마: `1.0.0` 유지  
범위: 근거팩과 질문 수정만 수행. 캐릭터 카드, 대사 로그, 평가 결과, 앱 코드는 수정하지 않음.

## 개정 이유

독립 감사에서 출처 레지스트리에 등록되지 않은 URL, 사실과 해석이 합쳐진 앵커, 서로 다른 판본의 혼동, 특정 결론을 미리 주는 교정형 질문의 반복이 확인됐다. 이번 개정은 그 네 가지 P0 문제를 고친다. 이 자료는 작품 전문을 대체하지 않으며, 캐릭터가 **제공된 근거에 어떻게 반응하는지**를 시험한다.

## 출처 폐쇄성 수정

- *Nicomachean Ethics*: MIT Book I·III·V와 Project Gutenberg HTML을 최상위 `sources`에 등록했다. `NIC-11`의 확장자 없는 URL은 등록된 `.htm` 주소로 정규화했다.
- *Atomic Habits*: `ATO-02`와 `ATO-07`이 참조하던 저자 공식 글 두 개를 최상위 `sources`에 등록했다.
- *Pride and Prejudice*: 모든 `PNP` 앵커가 사용하는 Project Gutenberg 전체 HTML을 최상위 `sources`에 등록했다.
- 검증 결과: 9권의 모든 `anchors[].sourceUrls`가 같은 팩의 `sources[].url`과 정확히 일치한다.

## 사실·해석 경계

- `COS-09`는 출판사 소개가 확인하는 구성 사실과 “과학을 역사 속 인간 활동으로 읽게 한다”는 해석을 한 문장에 담고 있었지만 `verified_source`로 표시돼 있었다.
- 앵커 수를 늘리지 않고 문장을 출처 귀속형으로 고쳐 `interpretive`로 재분류했다.
- *Cosmos*는 12개 앵커를 유지하며, 경이로운 전달과 과학적 확실성을 동일시하지 않는 경계도 유지한다.

## 판본 설명 수정

- Project Gutenberg #1342의 HTML은 **1894년 George Allen 판본 계열이며 Hugh Thomson 삽화가 포함된 자료**다.
- Library of Congress 항목은 **별도로 보존된 1917년 판본**이다.
- 두 자료를 “1917 계열 텍스트” 또는 같은 판본으로 묶지 않도록 `uncertainties`, `prohibitedClaims`, 읽기용 문서를 함께 수정했다.

## 질문 재균형

각 책은 다음 다섯 `turnType`을 정확히 한 번씩 유지한다.

1. `first_impression`
2. `evidence_selection`
3. `respond_to_user`
4. `directed_rebuttal`
5. `revise_after_counterevidence`

개정한 질문은 특정 인물의 예상 결론을 넣지 않는다. 근거 선택, 가치와 행동의 충돌, 감정·관계·장면 반응, 반대 근거 뒤 수정이 한 책 안에서 분산되도록 구성했다. 과장된 주장을 바로잡는 형식은 책마다 최대 한 문항 수준으로 제한했고, 특히 `COS-Q3~Q5`, `ATO-Q1/Q4/Q5`, `HNM-Q1/Q3/Q4`, `MRA-Q2~Q5`를 전면 교체했다.

홀드아웃 질문도 문장 구조를 달리했다. *1984*는 기억과 친밀성 및 권력 수단, *The Murder of Roger Ackroyd*는 화자 신뢰와 독자 감정 및 자비·책임, *One Hundred Years of Solitude*는 장면의 시선과 가족·역사 및 환상·고통을 묻는다. 따라서 책 제목뿐 아니라 질문 형식의 변화에도 캐릭터 판단이 유지되는지를 볼 수 있다.

## 자동 검증 결과

- 9개 팩, 개발 6권 + 홀드아웃 3권
- 책 ID 9개 고유
- 앵커 10~14개/권
- 질문 5개/권, 총 45개 질문 ID 고유
- 다섯 `turnType` 정확히 1회/권
- 모든 질문의 `requiredAnchorIds`와 `counterEvidenceIds`가 같은 책 안에서 해소됨
- 모든 앵커 URL의 최상위 출처 레지스트리 폐쇄성 통과
- 모든 팩에 `uncertainties`와 `prohibitedClaims` 존재

## 재실행 주의

질문 입력이 바뀌었으므로 기존 생성 대사와 블라인드 점수는 v2의 결과로 재사용할 수 없다. 다음 평가는 캐릭터 카드나 프롬프트를 책별로 추가 조정하기 전에 동일한 v2 팩으로 전체 매트릭스를 다시 생성해야 한다.
