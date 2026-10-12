"""Собирает самодостаточный index.html из шаблона интерфейса, модулей интерфейса (src/app/*.js),
системного промпта ИИ (src/ai-prompt.txt) и ядра анализатора.
Запуск из любой папки: python3 src/build.py"""
import hashlib
import pathlib
here = pathlib.Path(__file__).resolve().parent
rd = lambda p: p.read_text(encoding='utf8')
t = rd(here / 'app.template.html')
c = rd(here / 'core.js')
cl = rd(here / 'utils' / 'logCleaner.js')
sd = rd(here / 'utils' / 'sysdiag.js')
pr = rd(here / 'ai-prompt.txt').rstrip('\n')
assert '`' not in pr and '${' not in pr, 'в ai-prompt.txt нельзя обратные кавычки и ${'
app = '\n'.join(rd(f).rstrip('\n') for f in sorted((here / 'app').glob('*.js')))
assert '/*#APP*/' in t and '</script>' not in app
t = t.replace('/*#APP*/', app)
pv = hashlib.sha1(pr.encode('utf8')).hexdigest()[:8]
t = t.replace('/*#AI_PROMPT_VERSION*/', "'" + pv + "'").replace('/*#AI_PROMPT*/', pr)
assert '/*CORE*/' in t and '</script>' not in c and '</script>' not in cl and '</script>' not in sd
(here.parent / 'index.html').write_text(t.replace('/*CORE*/', cl + '\n' + sd + '\n' + c), encoding='utf8')
print('index.html built')
