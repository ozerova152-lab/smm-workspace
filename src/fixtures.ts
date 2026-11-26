export const demoProjects = [
  { id: 'studio', name: 'Студия «Север»', platforms: [{ id: 'community', name: 'Сообщество', format: 'Пост' }] },
  { id: 'garden', name: 'Городской сад', platforms: [{ id: 'video', name: 'Видеоканал', format: 'Короткое видео' }] },
]

export const demoFixtures = {
  cards: [
    { id: 'idea', title: 'Как ухаживать за рассадой', type: 'idea', projectId: 'garden' },
    { id: 'clip', title: 'Три совета по рассаде', type: 'publication', ideaId: 'idea', format: 'Короткое видео', due: '2026-11-20' },
    { id: 'post', title: 'Чек-лист по рассаде', type: 'publication', ideaId: 'idea', format: 'Пост', due: '2026-11-22' },
  ],
  templates: [{ name: 'Короткий пост', text: 'Вопрос читателю, пример, следующий шаг.' }],
  strategy: [{ projectId: 'garden', hypothesis: 'Короткие инструкции чаще сохраняют.' }],
  references: [{ projectId: 'garden', url: 'https://example.com/garden', note: 'Структура инструкции' }],
}
