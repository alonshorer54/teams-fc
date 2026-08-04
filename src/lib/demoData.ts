/**
 * 21 שחקני דוגמה (3 קבוצות של 7) לבדיקה מהירה של האפליקציה.
 * friendOfIndex מצביע על מיקום ברשימה — המזהים האמיתיים נוצרים בזמן הטעינה.
 */
export const DEMO_PLAYERS: { name: string; rating: number; friendOfIndex?: number }[] = [
  { name: 'איתי לוי', rating: 4.8 },
  { name: 'עומר כהן', rating: 4.6 },
  { name: 'דניאל מזרחי', rating: 4.5, friendOfIndex: 0 },
  { name: 'יונתן פרץ', rating: 4.3 },
  { name: 'רועי בן דוד', rating: 4.2 },
  { name: 'אלון שרון', rating: 4.0, friendOfIndex: 1 },
  { name: 'ניר אברהמי', rating: 3.9 },
  { name: 'שחר גולן', rating: 3.8 },
  { name: 'עידו ביטון', rating: 3.7, friendOfIndex: 3 },
  { name: 'טל אשכנזי', rating: 3.6 },
  { name: 'גיא מלכה', rating: 3.5 },
  { name: 'אורי דהן', rating: 3.4, friendOfIndex: 10 },
  { name: 'מתן שמש', rating: 3.3 },
  { name: 'ליאור אוחנה', rating: 3.2 },
  { name: 'עידן חדד', rating: 3.1, friendOfIndex: 13 },
  { name: 'נדב ברששת', rating: 3.0 },
  { name: 'יובל אלמוג', rating: 2.8 },
  { name: 'רן שטרן', rating: 2.7, friendOfIndex: 16 },
  { name: 'אסף נחום', rating: 2.5 },
  { name: 'עמית קדוש', rating: 2.3 },
  { name: 'בר יוספי', rating: 2.0, friendOfIndex: 19 },
];
