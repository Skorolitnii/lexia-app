import type { StudyLanguage } from "@/speech/languages";

/**
 * Стартовые колоды для пустого аккаунта.
 *
 * Держим их в том же формате, что и файл от нейросети (§4), и прогоняем через
 * тот же `parseDeck`: стартовый импорт не должен иметь отдельную схему.
 */
export const STARTER_DECK_SIZE = 100;

export interface StarterDeckPreset {
  id: StudyLanguage;
  language: StudyLanguage;
  title: string;
  languageName: string;
}

export const STARTER_DECK_PRESETS: readonly StarterDeckPreset[] = [
  {
    id: "en",
    language: "en",
    title: "100 главных слов",
    languageName: "English",
  },
  {
    id: "de",
    language: "de",
    title: "100 главных слов",
    languageName: "Deutsch",
  },
  {
    id: "it",
    language: "it",
    title: "100 главных слов",
    languageName: "Italiano",
  },
  {
    id: "fr",
    language: "fr",
    title: "100 главных слов",
    languageName: "Français",
  },
  {
    id: "es",
    language: "es",
    title: "100 главных слов",
    languageName: "Español",
  },
];

export const STARTER_DECK_TITLE = STARTER_DECK_PRESETS[0]!.title;

const WORDS: Record<StudyLanguage, string> = {
  en: `
morning=утро
evening=вечер
night=ночь
day=день
week=неделя
year=год
time=время
today=сегодня
tomorrow=завтра
yesterday=вчера
home=дом
room=комната
kitchen=кухня
window=окно
door=дверь
street=улица
city=город
country=страна
water=вода
bread=хлеб
food=еда
coffee=кофе
tea=чай
money=деньги
work=работа; работать
school=школа
book=книга
phone=телефон
car=машина
train=поезд
friend=друг
family=семья
child=ребёнок
people=люди
person=человек
name=имя
question=вопрос
answer=ответ; отвечать
word=слово
language=язык
help=помощь; помогать
problem=проблема
idea=идея
thing=вещь
place=место
way=путь; способ
life=жизнь
love=любовь; любить
hand=рука
eye=глаз
head=голова
small=маленький
big=большой
good=хороший
bad=плохой
new=новый
old=старый
early=рано; ранний
late=поздно; поздний
important=важный
difficult=трудный
easy=лёгкий
right=правильный; правый
left=левый
near=рядом
far=далеко
hot=горячий
cold=холодный
beautiful=красивый
happy=счастливый
tired=уставший
to be=быть
to have=иметь
to do=делать
to go=идти; ехать
to come=приходить
to see=видеть
to say=сказать
to know=знать
to think=думать
to want=хотеть
to need=нуждаться
to like=нравиться
to learn=учить
to remember=помнить
to understand=понимать
to buy=покупать
to eat=есть
to drink=пить
to sleep=спать
always=всегда
often=часто
sometimes=иногда
never=никогда
here=здесь
there=там
now=сейчас
maybe=может быть
very=очень
enough=достаточно
`,
  de: `
der Morgen=утро
Abend=вечер
Nacht=ночь
Tag=день
Woche=неделя
Jahr=год
Zeit=время
heute=сегодня
morgen=завтра
gestern=вчера
Haus=дом
Zimmer=комната
Küche=кухня
Fenster=окно
Tür=дверь
Straße=улица
Stadt=город
Land=страна
Wasser=вода
Brot=хлеб
das Essen=еда
Kaffee=кофе
Tee=чай
Geld=деньги
Arbeit=работа
Schule=школа
Buch=книга
Telefon=телефон
Auto=машина
Zug=поезд
Freund=друг
Familie=семья
Kind=ребёнок
Leute=люди
Name=имя
Frage=вопрос
Antwort=ответ
Wort=слово
Sprache=язык
Hilfe=помощь
Problem=проблема
Idee=идея
Ding=вещь
Ort=место
Weg=путь; способ
Leben=жизнь
Liebe=любовь
Hand=рука
Auge=глаз
Kopf=голова
klein=маленький
groß=большой
gut=хороший
schlecht=плохой
neu=новый
alt=старый
früh=рано; ранний
spät=поздно; поздний
wichtig=важный
schwierig=трудный
einfach=лёгкий
richtig=правильный
links=слева
rechts=справа
nah=рядом
weit=далеко
heiß=горячий
kalt=холодный
schön=красивый
glücklich=счастливый
müde=уставший
sein=быть
haben=иметь
machen=делать
gehen=идти
kommen=приходить
sehen=видеть
sagen=сказать
wissen=знать
denken=думать
wollen=хотеть
brauchen=нуждаться
mögen=нравиться
lernen=учить
sich erinnern=помнить
verstehen=понимать
kaufen=покупать
essen=есть
trinken=пить
schlafen=спать
immer=всегда
oft=часто
manchmal=иногда
nie=никогда
hier=здесь
dort=там
jetzt=сейчас
vielleicht=может быть
sehr=очень
genug=достаточно
`,
  it: `
mattina=утро
sera=вечер
notte=ночь
giorno=день
settimana=неделя
anno=год
tempo=время
oggi=сегодня
domani=завтра
ieri=вчера
casa=дом
stanza=комната
cucina=кухня
finestra=окно
porta=дверь
strada=улица
città=город
paese=страна
acqua=вода
pane=хлеб
cibo=еда
caffè=кофе
tè=чай
soldi=деньги
lavoro=работа
scuola=школа
libro=книга
telefono=телефон
macchina=машина
treno=поезд
amico=друг
famiglia=семья
bambino=ребёнок
gente=люди
nome=имя
domanda=вопрос
risposta=ответ
parola=слово
lingua=язык
aiuto=помощь
problema=проблема
idea=идея
cosa=вещь
posto=место
modo=способ
vita=жизнь
amore=любовь
mano=рука
occhio=глаз
testa=голова
piccolo=маленький
grande=большой
buono=хороший
cattivo=плохой
nuovo=новый
vecchio=старый
presto=рано
tardi=поздно
importante=важный
difficile=трудный
facile=лёгкий
giusto=правильный
sinistra=левый; слева
destra=правый; справа
vicino=рядом
lontano=далеко
caldo=горячий
freddo=холодный
bello=красивый
felice=счастливый
stanco=уставший
essere=быть
avere=иметь
fare=делать
andare=идти; ехать
venire=приходить
vedere=видеть
dire=сказать
sapere=знать
pensare=думать
volere=хотеть
avere bisogno=нуждаться
piacere=нравиться
imparare=учить
ricordare=помнить
capire=понимать
comprare=покупать
mangiare=есть
bere=пить
dormire=спать
sempre=всегда
spesso=часто
a volte=иногда
mai=никогда
qui=здесь
lì=там
adesso=сейчас
forse=может быть
molto=очень
abbastanza=достаточно
`,
  fr: `
matin=утро
soir=вечер
nuit=ночь
jour=день
semaine=неделя
année=год
temps=время
aujourd'hui=сегодня
demain=завтра
hier=вчера
maison=дом
chambre=комната
cuisine=кухня
fenêtre=окно
porte=дверь
rue=улица
ville=город
pays=страна
eau=вода
pain=хлеб
nourriture=еда
café=кофе
thé=чай
argent=деньги
travail=работа
école=школа
livre=книга
téléphone=телефон
voiture=машина
train=поезд
ami=друг
famille=семья
enfant=ребёнок
gens=люди
nom=имя
question=вопрос
réponse=ответ
mot=слово
langue=язык
aide=помощь
problème=проблема
idée=идея
chose=вещь
lieu=место
façon=способ
vie=жизнь
amour=любовь
main=рука
œil=глаз
tête=голова
petit=маленький
grand=большой
bon=хороший
mauvais=плохой
nouveau=новый
vieux=старый
tôt=рано
tard=поздно
important=важный
difficile=трудный
facile=лёгкий
correct=правильный
gauche=левый; слева
droite=правый; справа
près=рядом
loin=далеко
chaud=горячий
froid=холодный
beau=красивый
heureux=счастливый
fatigué=уставший
être=быть
avoir=иметь
faire=делать
aller=идти; ехать
venir=приходить
voir=видеть
dire=сказать
savoir=знать
penser=думать
vouloir=хотеть
avoir besoin=нуждаться
aimer=нравиться; любить
apprendre=учить
se souvenir=помнить
comprendre=понимать
acheter=покупать
manger=есть
boire=пить
dormir=спать
toujours=всегда
souvent=часто
parfois=иногда
jamais=никогда
ici=здесь
là=там
maintenant=сейчас
peut-être=может быть
très=очень
assez=достаточно
`,
  es: `
mañana=утро
tarde=вечер
noche=ночь
día=день
semana=неделя
año=год
tiempo=время
hoy=сегодня
mañana día=завтра
ayer=вчера
casa=дом
habitación=комната
cocina=кухня
ventana=окно
puerta=дверь
calle=улица
ciudad=город
país=страна
agua=вода
pan=хлеб
comida=еда
café=кофе
té=чай
dinero=деньги
trabajo=работа
escuela=школа
libro=книга
teléfono=телефон
coche=машина
tren=поезд
amigo=друг
familia=семья
niño=ребёнок
gente=люди
nombre=имя
pregunta=вопрос
respuesta=ответ
palabra=слово
idioma=язык
ayuda=помощь
problema=проблема
idea=идея
cosa=вещь
lugar=место
manera=способ
vida=жизнь
amor=любовь
mano=рука
ojo=глаз
cabeza=голова
pequeño=маленький
grande=большой
bueno=хороший
malo=плохой
nuevo=новый
viejo=старый
temprano=рано
tarde tiempo=поздно
importante=важный
difícil=трудный
fácil=лёгкий
correcto=правильный
izquierda=левый; слева
derecha=правый; справа
cerca=рядом
lejos=далеко
caliente=горячий
frío=холодный
bonito=красивый
feliz=счастливый
cansado=уставший
ser=быть
tener=иметь
hacer=делать
ir=идти; ехать
venir=приходить
ver=видеть
decir=сказать
saber=знать
pensar=думать
querer=хотеть
necesitar=нуждаться
gustar=нравиться
aprender=учить
recordar=помнить
entender=понимать
comprar=покупать
comer=есть
beber=пить
dormir=спать
siempre=всегда
a menudo=часто
a veces=иногда
nunca=никогда
aquí=здесь
allí=там
ahora=сейчас
quizás=может быть
muy=очень
suficiente=достаточно
`,
};

const EXAMPLE_TEMPLATES: Record<
  StudyLanguage,
  (front: string, back: string) => { text: string; translation: string }
> = {
  en: (front, back) => ({
    text: `I see the word "${front}" in everyday English.`,
    translation: `Я встречаю слово «${front}» в повседневном английском. Значение: ${back}.`,
  }),
  de: (front, back) => ({
    text: `Ich lerne "${front}" heute.`,
    translation: `Сегодня я учу «${front}». Значение: ${back}.`,
  }),
  it: (front, back) => ({
    text: `Oggi imparo "${front}".`,
    translation: `Сегодня я учу «${front}». Значение: ${back}.`,
  }),
  fr: (front, back) => ({
    text: `Aujourd'hui, j'apprends "${front}".`,
    translation: `Сегодня я учу «${front}». Значение: ${back}.`,
  }),
  es: (front, back) => ({
    text: `Hoy aprendo "${front}".`,
    translation: `Сегодня я учу «${front}». Значение: ${back}.`,
  }),
};

function details(front: string, back: string): string {
  const kind = front.includes(" ") ? "фраза" : "слово";
  const meanings = back.includes(";")
    ? "\n\n**Нюанс:** у карточки несколько близких переводов; выбирайте по контексту."
    : "";
  return `**Часть речи:** базовая лексика\n\n**Тип:** ${kind} для первых самостоятельных фраз.${meanings}`;
}

function notes(language: StudyLanguage) {
  return WORDS[language]
    .trim()
    .split("\n")
    .map((line) => {
      const [front, back] = line.split("=");
      const cleanFront = front!.trim();
      const cleanBack = back!.trim();
      return {
        type: "basic" as const,
        front: cleanFront,
        back: cleanBack,
        reverse: true,
        examples: [EXAMPLE_TEMPLATES[language](cleanFront, cleanBack)],
        details: details(cleanFront, cleanBack),
      };
    });
}

export function starterDeckJson(presetId: StudyLanguage): string {
  const preset = STARTER_DECK_PRESETS.find((item) => item.id === presetId);
  if (!preset) throw new Error(`Unknown starter deck: ${presetId}`);
  return JSON.stringify({
    version: 1,
    language: preset.language,
    folder: `${preset.title} - ${preset.languageName}`,
    notes: notes(preset.language),
  });
}

/** Legacy export for old imports/tests: English preset. */
export const STARTER_DECK_JSON = starterDeckJson("en");
