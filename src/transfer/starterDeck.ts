/**
 * Стартовая колода для пустого аккаунта («Пустой экран v2»).
 *
 * Держим её в том же формате, что и файл от нейросети (§4), и прогоняем через
 * тот же `parseDeck` + обогащение из словаря: у стартовой колоды нет своего,
 * второго пути импорта, который мог бы разойтись с основным. Транскрипции и
 * аудио здесь намеренно нет - их дотянет словарь, как и для любой колоды.
 *
 * Размер сознательно небольшой: это витрина формата и первый заход в
 * повторения, а не «топ-1000». Слова - бытовой минимум с примерами.
 */
export const STARTER_DECK_TITLE = 'Первые слова'
export const STARTER_DECK_SIZE = 30

export const STARTER_DECK_JSON = JSON.stringify({
  version: 1,
  folder: STARTER_DECK_TITLE,
  notes: [
    {
      type: 'basic',
      front: 'morning',
      back: 'утро',
      reverse: true,
      examples: [
        { text: 'I read the news every morning.', translation: 'Я читаю новости каждое утро.' },
      ],
    },
    {
      type: 'basic',
      front: 'kitchen',
      back: 'кухня',
      reverse: true,
      examples: [{ text: 'She is cooking in the kitchen.', translation: 'Она готовит на кухне.' }],
    },
    {
      type: 'basic',
      front: 'window',
      back: 'окно',
      reverse: true,
      examples: [{ text: 'Please close the window.', translation: 'Пожалуйста, закрой окно.' }],
    },
    {
      type: 'basic',
      front: 'bread',
      back: 'хлеб',
      reverse: true,
      examples: [{ text: 'We bought fresh bread.', translation: 'Мы купили свежий хлеб.' }],
    },
    {
      type: 'basic',
      front: 'water',
      back: 'вода',
      reverse: true,
      examples: [{ text: 'Can I have a glass of water?', translation: 'Можно мне стакан воды?' }],
    },
    {
      type: 'basic',
      front: 'street',
      back: 'улица',
      reverse: true,
      examples: [
        { text: 'They live on a quiet street.', translation: 'Они живут на тихой улице.' },
      ],
    },
    {
      type: 'basic',
      front: 'friend',
      back: 'друг',
      reverse: true,
      examples: [
        { text: 'My friend works at a hospital.', translation: 'Мой друг работает в больнице.' },
      ],
    },
    {
      type: 'basic',
      front: 'work',
      back: 'работа; работать',
      reverse: true,
      examples: [{ text: 'I go to work by bus.', translation: 'Я езжу на работу на автобусе.' }],
      details:
        '**Часть речи:** существительное и глагол.\n\nВ значении «работа» - неисчисляемое: не *a work*, а *work* или *a job*.',
    },
    {
      type: 'basic',
      front: 'money',
      back: 'деньги',
      reverse: true,
      examples: [
        { text: 'He saved money for a trip.', translation: 'Он копил деньги на поездку.' },
      ],
      details:
        '**Нюанс:** неисчисляемое, глагол в единственном числе - *money is*, не *money are*.',
    },
    {
      type: 'basic',
      front: 'week',
      back: 'неделя',
      reverse: true,
      examples: [{ text: 'See you next week.', translation: 'Увидимся на следующей неделе.' }],
    },
    {
      type: 'basic',
      front: 'answer',
      back: 'ответ; отвечать',
      reverse: true,
      examples: [{ text: 'Nobody knew the answer.', translation: 'Никто не знал ответа.' }],
    },
    {
      type: 'basic',
      front: 'question',
      back: 'вопрос',
      reverse: true,
      examples: [{ text: 'May I ask a question?', translation: 'Можно задать вопрос?' }],
    },
    {
      type: 'basic',
      front: 'people',
      back: 'люди',
      reverse: true,
      examples: [
        { text: 'Many people came to the concert.', translation: 'На концерт пришло много людей.' },
      ],
      details:
        '**Нюанс:** множественное число от *person*. Форма *persons* встречается только в официальных и юридических текстах.',
    },
    {
      type: 'basic',
      front: 'child',
      back: 'ребёнок',
      reverse: true,
      examples: [{ text: 'The child is asleep.', translation: 'Ребёнок спит.' }],
      details: '**Нюанс:** неправильное множественное - *children*, не *childs*.',
    },
    {
      type: 'basic',
      front: 'city',
      back: 'город',
      reverse: true,
      examples: [
        { text: 'Lisbon is a beautiful city.', translation: 'Лиссабон - красивый город.' },
      ],
    },
    {
      type: 'basic',
      front: 'country',
      back: 'страна; сельская местность',
      reverse: true,
      examples: [{ text: 'Which country are you from?', translation: 'Из какой ты страны?' }],
    },
    {
      type: 'basic',
      front: 'language',
      back: 'язык',
      reverse: true,
      examples: [
        { text: 'English is not an easy language.', translation: 'Английский - непростой язык.' },
      ],
    },
    {
      type: 'basic',
      front: 'book',
      back: 'книга',
      reverse: true,
      examples: [
        { text: 'This book changed my mind.', translation: 'Эта книга изменила моё мнение.' },
      ],
    },
    {
      type: 'basic',
      front: 'learn',
      back: 'учить, узнавать',
      reverse: true,
      examples: [
        { text: 'Children learn very quickly.', translation: 'Дети учатся очень быстро.' },
      ],
      details: '**Не путать:** *learn* - усваивать самому, *teach* - учить кого-то другого.',
    },
    {
      type: 'basic',
      front: 'remember',
      back: 'помнить, вспоминать',
      reverse: true,
      examples: [{ text: "I don't remember his name.", translation: 'Я не помню его имени.' }],
    },
    {
      type: 'basic',
      front: 'buy',
      back: 'покупать',
      reverse: true,
      examples: [{ text: 'She wants to buy a bike.', translation: 'Она хочет купить велосипед.' }],
      details: '**Формы:** buy - bought - bought.',
    },
    {
      type: 'basic',
      front: 'understand',
      back: 'понимать',
      reverse: true,
      examples: [{ text: 'I understand you perfectly.', translation: 'Я прекрасно вас понимаю.' }],
      details: '**Формы:** understand - understood - understood.',
    },
    {
      type: 'basic',
      front: 'important',
      back: 'важный',
      reverse: true,
      examples: [{ text: 'This is an important decision.', translation: 'Это важное решение.' }],
    },
    {
      type: 'basic',
      front: 'difficult',
      back: 'трудный, сложный',
      reverse: true,
      examples: [{ text: 'The test was difficult.', translation: 'Тест был трудным.' }],
    },
    {
      type: 'basic',
      front: 'early',
      back: 'рано; ранний',
      reverse: true,
      examples: [{ text: 'We left early in the morning.', translation: 'Мы уехали рано утром.' }],
    },
    {
      type: 'basic',
      front: 'enough',
      back: 'достаточно',
      reverse: true,
      examples: [{ text: 'We have enough time.', translation: 'У нас достаточно времени.' }],
      details:
        '**Порядок слов:** после прилагательного - *good enough*, но перед существительным - *enough time*.',
    },
    {
      type: 'basic',
      front: 'always',
      back: 'всегда',
      reverse: true,
      examples: [{ text: 'He is always late.', translation: 'Он всегда опаздывает.' }],
    },
    {
      type: 'basic',
      front: 'maybe',
      back: 'может быть',
      reverse: true,
      examples: [
        { text: 'Maybe we should wait.', translation: 'Может быть, нам стоит подождать.' },
      ],
    },
    {
      type: 'cloze',
      front: 'I usually {{wake up::просыпаюсь}} at seven.',
      back: 'Обычно я просыпаюсь в семь.',
    },
    {
      type: 'cloze',
      front: 'She has been {{waiting::ждёт}} for an hour.',
      back: 'Она ждёт уже час.',
    },
  ],
})
