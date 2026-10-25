# Source of packages/banks/bigfive/ipip-b5-0.1.0.json (run: python generate.py ipip-b5-0.1.0.json).
# Published versions are immutable: for changes, write a new version file.
# Sources (IPIP, public domain): https://ipip.ori.org/new_ipip-50-item-scale.htm ,
# https://ipip.ori.org/30FacetNEO-PI-RItems.htm ; Mini-IPIP = Donnellan et al. (2006).
import io, json, sys

# English original -> Chinese translation (MindScope, 2026). Keys are the exact IPIP wording.
ZH = {
 # ── IPIP 50-item Big-Five factor markers ──
 "Am the life of the party.": "我是聚会中的活跃人物。",
 "Feel little concern for others.": "我不太关心别人。",
 "Am always prepared.": "我做事总是准备充分。",
 "Get stressed out easily.": "我很容易感到压力很大。",
 "Have a rich vocabulary.": "我的词汇量很丰富。",
 "Don't talk a lot.": "我话不多。",
 "Am interested in people.": "我对人很感兴趣。",
 "Leave my belongings around.": "我的东西经常随手乱放。",
 "Am relaxed most of the time.": "我大部分时间都很放松。",
 "Have difficulty understanding abstract ideas.": "我很难理解抽象的概念。",
 "Feel comfortable around people.": "和别人在一起时我感到自在。",
 "Insult people.": "我会出言冒犯别人。",
 "Pay attention to details.": "我注重细节。",
 "Worry about things.": "我常常为各种事情担心。",
 "Have a vivid imagination.": "我的想象力很丰富。",
 "Keep in the background.": "我习惯待在不显眼的位置。",
 "Sympathize with others' feelings.": "我能体谅别人的感受。",
 "Make a mess of things.": "我常把事情弄得一团糟。",
 "Seldom feel blue.": "我很少感到情绪低落。",
 "Am not interested in abstract ideas.": "我对抽象的概念不感兴趣。",
 "Start conversations.": "我会主动和别人搭话。",
 "Am not interested in other people's problems.": "我对别人遇到的难处不感兴趣。",
 "Get chores done right away.": "我会马上把琐事做完。",
 "Am easily disturbed.": "我很容易心神不宁。",
 "Have excellent ideas.": "我常有很好的点子。",
 "Have little to say.": "我常常没什么话可说。",
 "Have a soft heart.": "我心肠很软。",
 "Often forget to put things back in their proper place.": "我经常忘记把东西放回原处。",
 "Get upset easily.": "我很容易心烦。",
 "Do not have a good imagination.": "我的想象力不太好。",
 "Talk to a lot of different people at parties.": "在聚会上我会和很多不同的人交谈。",
 "Am not really interested in others.": "我对别人并不真正感兴趣。",
 "Like order.": "我喜欢井然有序。",
 "Change my mood a lot.": "我的心情经常变来变去。",
 "Am quick to understand things.": "我理解事物很快。",
 "Don't like to draw attention to myself.": "我不喜欢引人注意。",
 "Take time out for others.": "我愿意抽出时间给别人。",
 "Shirk my duties.": "我会逃避自己应尽的责任。",
 "Have frequent mood swings.": "我的情绪经常大起大落。",
 "Use difficult words.": "我说话时会用一些难懂的词。",
 "Don't mind being the center of attention.": "我不介意成为众人关注的焦点。",
 "Feel others' emotions.": "我能感受到别人的情绪。",
 "Follow a schedule.": "我会按日程安排做事。",
 "Get irritated easily.": "我很容易烦躁。",
 "Spend time reflecting on things.": "我会花时间反思各种事情。",
 "Am quiet around strangers.": "在陌生人面前我很安静。",
 "Make people feel at ease.": "我能让别人感到轻松自在。",
 "Am exacting in my work.": "我对自己的工作要求严格、一丝不苟。",
 "Often feel blue.": "我经常感到情绪低落。",
 "Am full of ideas.": "我脑子里总有很多想法。",
 # ── IPIP-NEO-120 (items not already above) ──
 "Fear for the worst.": "我总是往最坏的方面想。",
 "Am afraid of many things.": "我害怕很多事情。",
 "Get angry easily.": "我很容易生气。",
 "Lose my temper.": "我会发脾气。",
 "Am not easily annoyed.": "我不容易被惹恼。",
 "Dislike myself.": "我不喜欢自己。",
 "Am often down in the dumps.": "我常常闷闷不乐。",
 "Feel comfortable with myself.": "我能接纳自己，和自己相处得很自在。",
 "Find it difficult to approach others.": "我觉得很难主动接近别人。",
 "Am afraid to draw attention to myself.": "我害怕引起别人的注意。",
 "Only feel comfortable with friends.": "只有和朋友在一起时我才感到自在。",
 "Am not bothered by difficult social situations.": "棘手的社交场合不会让我感到困扰。",
 "Go on binges.": "我会一时放纵、毫无节制（例如暴饮暴食、疯狂购物）。",
 "Rarely overindulge.": "我很少过度放纵自己。",
 "Easily resist temptations.": "我能轻松抵抗诱惑。",
 "Am able to control my cravings.": "我能控制住自己的欲望。",
 "Panic easily.": "我很容易惊慌失措。",
 "Become overwhelmed by events.": "发生的事情常常让我应付不过来。",
 "Feel that I'm unable to deal with things.": "我觉得自己没有能力应对各种事情。",
 "Remain calm under pressure.": "在压力下我能保持冷静。",
 "Make friends easily.": "我很容易交到朋友。",
 "Avoid contacts with others.": "我会回避和别人接触。",
 "Keep others at a distance.": "我会和别人保持距离。",
 "Love large parties.": "我喜欢热闹的大型聚会。",
 "Prefer to be alone.": "我更喜欢独处。",
 "Avoid crowds.": "我会避开人多的地方。",
 "Take charge.": "我会主动挑起担子、负责局面。",
 "Try to lead others.": "我会尝试带领别人。",
 "Take control of things.": "我会把事情掌控在自己手里。",
 "Wait for others to lead the way.": "我会等别人来带头。",
 "Am always busy.": "我总是很忙。",
 "Am always on the go.": "我总是闲不下来、四处奔忙。",
 "Do a lot in my spare time.": "我在业余时间会做很多事情。",
 "Like to take it easy.": "我喜欢悠闲自在、不慌不忙。",
 "Love excitement.": "我喜欢刺激。",
 "Seek adventure.": "我会去寻找冒险的机会。",
 "Enjoy being reckless.": "我享受不顾后果的感觉。",
 "Act wild and crazy.": "我会做一些疯狂出格的事。",
 "Radiate joy.": "我浑身散发着快乐。",
 "Have a lot of fun.": "我过得很开心。",
 "Love life.": "我热爱生活。",
 "Look at the bright side of life.": "我会看到生活中光明的一面。",
 "Enjoy wild flights of fantasy.": "我喜欢天马行空地幻想。",
 "Love to daydream.": "我喜欢做白日梦。",
 "Like to get lost in thought.": "我喜欢沉浸在思考之中。",
 "Believe in the importance of art.": "我相信艺术很重要。",
 "See beauty in things that others might not notice.": "我能在别人可能注意不到的事物中发现美。",
 "Do not like poetry.": "我不喜欢诗歌。",
 "Do not enjoy going to art museums.": "我不喜欢逛美术馆或艺术展。",
 "Experience my emotions intensely.": "我的情绪体验很强烈。",
 "Rarely notice my emotional reactions.": "我很少留意自己的情绪反应。",
 "Don't understand people who get emotional.": "我不理解那些容易情绪化的人。",
 "Prefer variety to routine.": "比起一成不变，我更喜欢多样和变化。",
 "Prefer to stick with things that I know.": "我更愿意做自己熟悉的事。",
 "Dislike changes.": "我不喜欢变化。",
 "Am attached to conventional ways.": "我习惯沿用传统的做法。",
 "Love to read challenging material.": "我喜欢阅读有挑战性的内容。",
 "Avoid philosophical discussions.": "我会回避哲学性的讨论。",
 "Am not interested in theoretical discussions.": "我对理论性的讨论不感兴趣。",
 "Believe that there is no absolute right and wrong.": "我认为没有绝对的对与错。",
 "Believe that we should be tough on crime.": "我认为应该严厉打击犯罪。",
 "Trust others.": "我信任别人。",
 "Believe that others have good intentions.": "我相信别人通常是出于好意。",
 "Trust what people say.": "我相信别人说的话。",
 "Distrust people.": "我不信任别人。",
 "Use others for my own ends.": "我会利用别人来达到自己的目的。",
 "Cheat to get ahead.": "我会为了领先而作弊。",
 "Take advantage of others.": "我会占别人的便宜。",
 "Obstruct others' plans.": "我会妨碍别人的计划。",
 "Am concerned about others.": "我会关心别人。",
 "Love to help others.": "我乐于帮助别人。",
 "Am indifferent to the feelings of others.": "我对别人的感受漠不关心。",
 "Take no time for others.": "我不愿为别人花时间。",
 "Love a good fight.": "我喜欢和人激烈地争个高下。",
 "Yell at people.": "我会对人大吼大叫。",
 "Get back at others.": "我会报复别人。",
 "Believe that I am better than others.": "我认为自己比别人强。",
 "Think highly of myself.": "我把自己看得很高。",
 "Have a high opinion of myself.": "我对自己的评价很高。",
 "Boast about my virtues.": "我会夸耀自己的优点。",
 "Sympathize with the homeless.": "我同情无家可归的人。",
 "Feel sympathy for those who are worse off than myself.": "我同情那些境况比我差的人。",
 "Try not to think about the needy.": "我尽量不去想那些需要帮助的人。",
 "Complete tasks successfully.": "我能顺利完成任务。",
 "Excel in what I do.": "我在自己做的事情上表现出色。",
 "Handle tasks smoothly.": "我处理事情得心应手。",
 "Know how to get things done.": "我知道怎样把事情办成。",
 "Like to tidy up.": "我喜欢收拾整理。",
 "Leave a mess in my room.": "我的房间常常乱七八糟。",
 "Keep my promises.": "我会信守承诺。",
 "Tell the truth.": "我会说实话。",
 "Break rules.": "我会违反规则。",
 "Break my promises.": "我会违背自己的承诺。",
 "Do more than what's expected of me.": "我做的比别人期望的更多。",
 "Work hard.": "我工作努力。",
 "Put little time and effort into my work.": "我在工作上投入的时间和精力很少。",
 "Do just enough work to get by.": "我做事只求过得去。",
 "Carry out my plans.": "我会把计划付诸实行。",
 "Waste my time.": "我会浪费时间。",
 "Have difficulty starting tasks.": "我很难开始动手做事。",
 "Jump into things without thinking.": "我会不假思索地一头扎进去做事。",
 "Make rash decisions.": "我会草率地做决定。",
 "Rush into things.": "我做事很冲动、急于求成。",
 "Act without thinking.": "我做事不经过思考。",
 # ── MindScope adaptations replacing the two voting items in O6 ──
 "Am willing to rethink beliefs I have long held.": "我愿意重新审视自己长期持有的观念。",
 "Believe that the traditional way of doing things is always best.": "我认为传统的做法总是最好的。",
}
ADAPTED = {
 "Am willing to rethink beliefs I have long held.": "Tend to vote for liberal political candidates.",
 "Believe that the traditional way of doing things is always best.": "Tend to vote for conservative political candidates.",
}

# IPIP-50: (text, factor 1..5, key) — factor 4 is Emotional Stability; we score Neuroticism, so its key flips.
FFM50 = [
 ("Am the life of the party.",1,1),("Feel little concern for others.",2,-1),("Am always prepared.",3,1),("Get stressed out easily.",4,-1),("Have a rich vocabulary.",5,1),
 ("Don't talk a lot.",1,-1),("Am interested in people.",2,1),("Leave my belongings around.",3,-1),("Am relaxed most of the time.",4,1),("Have difficulty understanding abstract ideas.",5,-1),
 ("Feel comfortable around people.",1,1),("Insult people.",2,-1),("Pay attention to details.",3,1),("Worry about things.",4,-1),("Have a vivid imagination.",5,1),
 ("Keep in the background.",1,-1),("Sympathize with others' feelings.",2,1),("Make a mess of things.",3,-1),("Seldom feel blue.",4,1),("Am not interested in abstract ideas.",5,-1),
 ("Start conversations.",1,1),("Am not interested in other people's problems.",2,-1),("Get chores done right away.",3,1),("Am easily disturbed.",4,-1),("Have excellent ideas.",5,1),
 ("Have little to say.",1,-1),("Have a soft heart.",2,1),("Often forget to put things back in their proper place.",3,-1),("Get upset easily.",4,-1),("Do not have a good imagination.",5,-1),
 ("Talk to a lot of different people at parties.",1,1),("Am not really interested in others.",2,-1),("Like order.",3,1),("Change my mood a lot.",4,-1),("Am quick to understand things.",5,1),
 ("Don't like to draw attention to myself.",1,-1),("Take time out for others.",2,1),("Shirk my duties.",3,-1),("Have frequent mood swings.",4,-1),("Use difficult words.",5,1),
 ("Don't mind being the center of attention.",1,1),("Feel others' emotions.",2,1),("Follow a schedule.",3,1),("Get irritated easily.",4,-1),("Spend time reflecting on things.",5,1),
 ("Am quiet around strangers.",1,-1),("Make people feel at ease.",2,1),("Am exacting in my work.",3,1),("Often feel blue.",4,-1),("Am full of ideas.",5,1),
]
FACTOR = {1:"E",2:"A",3:"C",4:"N",5:"O"}

# Mini-IPIP in published order: (text, domain, key) with Neuroticism keyed as N.
MINI = [
 ("Am the life of the party.","E",1),("Sympathize with others' feelings.","A",1),("Get chores done right away.","C",1),("Have frequent mood swings.","N",1),("Have a vivid imagination.","O",1),
 ("Don't talk a lot.","E",-1),("Am not interested in other people's problems.","A",-1),("Often forget to put things back in their proper place.","C",-1),("Am relaxed most of the time.","N",-1),("Am not interested in abstract ideas.","O",-1),
 ("Talk to a lot of different people at parties.","E",1),("Feel others' emotions.","A",1),("Like order.","C",1),("Get upset easily.","N",1),("Have difficulty understanding abstract ideas.","O",-1),
 ("Keep in the background.","E",-1),("Am not really interested in others.","A",-1),("Make a mess of things.","C",-1),("Seldom feel blue.","N",-1),("Do not have a good imagination.","O",-1),
]

# IPIP-NEO-120 by facet: facet -> [(text, key)]
NEO = {
 "N1":[("Worry about things.",1),("Fear for the worst.",1),("Am afraid of many things.",1),("Get stressed out easily.",1)],
 "N2":[("Get angry easily.",1),("Get irritated easily.",1),("Lose my temper.",1),("Am not easily annoyed.",-1)],
 "N3":[("Often feel blue.",1),("Dislike myself.",1),("Am often down in the dumps.",1),("Feel comfortable with myself.",-1)],
 "N4":[("Find it difficult to approach others.",1),("Am afraid to draw attention to myself.",1),("Only feel comfortable with friends.",1),("Am not bothered by difficult social situations.",-1)],
 "N5":[("Go on binges.",1),("Rarely overindulge.",-1),("Easily resist temptations.",-1),("Am able to control my cravings.",-1)],
 "N6":[("Panic easily.",1),("Become overwhelmed by events.",1),("Feel that I'm unable to deal with things.",1),("Remain calm under pressure.",-1)],
 "E1":[("Make friends easily.",1),("Feel comfortable around people.",1),("Avoid contacts with others.",-1),("Keep others at a distance.",-1)],
 "E2":[("Love large parties.",1),("Talk to a lot of different people at parties.",1),("Prefer to be alone.",-1),("Avoid crowds.",-1)],
 "E3":[("Take charge.",1),("Try to lead others.",1),("Take control of things.",1),("Wait for others to lead the way.",-1)],
 "E4":[("Am always busy.",1),("Am always on the go.",1),("Do a lot in my spare time.",1),("Like to take it easy.",-1)],
 "E5":[("Love excitement.",1),("Seek adventure.",1),("Enjoy being reckless.",1),("Act wild and crazy.",1)],
 "E6":[("Radiate joy.",1),("Have a lot of fun.",1),("Love life.",1),("Look at the bright side of life.",1)],
 "O1":[("Have a vivid imagination.",1),("Enjoy wild flights of fantasy.",1),("Love to daydream.",1),("Like to get lost in thought.",1)],
 "O2":[("Believe in the importance of art.",1),("See beauty in things that others might not notice.",1),("Do not like poetry.",-1),("Do not enjoy going to art museums.",-1)],
 "O3":[("Experience my emotions intensely.",1),("Feel others' emotions.",1),("Rarely notice my emotional reactions.",-1),("Don't understand people who get emotional.",-1)],
 "O4":[("Prefer variety to routine.",1),("Prefer to stick with things that I know.",-1),("Dislike changes.",-1),("Am attached to conventional ways.",-1)],
 "O5":[("Love to read challenging material.",1),("Avoid philosophical discussions.",-1),("Have difficulty understanding abstract ideas.",-1),("Am not interested in theoretical discussions.",-1)],
 # Two voting items replaced (see ADAPTED); keys follow the items they replace.
 "O6":[("Am willing to rethink beliefs I have long held.",1),("Believe that there is no absolute right and wrong.",1),("Believe that the traditional way of doing things is always best.",-1),("Believe that we should be tough on crime.",-1)],
 "A1":[("Trust others.",1),("Believe that others have good intentions.",1),("Trust what people say.",1),("Distrust people.",-1)],
 "A2":[("Use others for my own ends.",-1),("Cheat to get ahead.",-1),("Take advantage of others.",-1),("Obstruct others' plans.",-1)],
 "A3":[("Am concerned about others.",1),("Love to help others.",1),("Am indifferent to the feelings of others.",-1),("Take no time for others.",-1)],
 "A4":[("Love a good fight.",-1),("Yell at people.",-1),("Insult people.",-1),("Get back at others.",-1)],
 "A5":[("Believe that I am better than others.",-1),("Think highly of myself.",-1),("Have a high opinion of myself.",-1),("Boast about my virtues.",-1)],
 "A6":[("Sympathize with the homeless.",1),("Feel sympathy for those who are worse off than myself.",1),("Am not interested in other people's problems.",-1),("Try not to think about the needy.",-1)],
 "C1":[("Complete tasks successfully.",1),("Excel in what I do.",1),("Handle tasks smoothly.",1),("Know how to get things done.",1)],
 "C2":[("Like to tidy up.",1),("Often forget to put things back in their proper place.",-1),("Leave a mess in my room.",-1),("Leave my belongings around.",-1)],
 "C3":[("Keep my promises.",1),("Tell the truth.",1),("Break rules.",-1),("Break my promises.",-1)],
 "C4":[("Do more than what's expected of me.",1),("Work hard.",1),("Put little time and effort into my work.",-1),("Do just enough work to get by.",-1)],
 "C5":[("Am always prepared.",1),("Carry out my plans.",1),("Waste my time.",-1),("Have difficulty starting tasks.",-1)],
 "C6":[("Jump into things without thinking.",-1),("Make rash decisions.",-1),("Rush into things.",-1),("Act without thinking.",-1)],
}
FACET_ORDER = ["N1","E1","O1","A1","C1","N2","E2","O2","A2","C2","N3","E3","O3","A3","C3","N4","E4","O4","A4","C4","N5","E5","O5","A5","C5","N6","E6","O6","A6","C6"]

# ── build the item list: FFM-50 order first, then new NEO items in administration order ──
order = [t for (t,_,_) in FFM50]
neo_admin = [NEO[f][k][0] for k in range(4) for f in FACET_ORDER]  # Johnson's interleaved order
for t in neo_admin:
    if t not in order: order.append(t)
for t,_,_ in MINI: assert t in order, t
missing = [t for t in order if t not in ZH]
assert not missing, missing
unused = [t for t in ZH if t not in order]
assert not unused, unused
ids = {t: f"B5-{i+1:03d}" for i, t in enumerate(order)}

def item(t):
    o = {"id": ids[t], "text": {"zh-CN": ZH[t], "en": t}}
    if t in ADAPTED:
        o["adapted"] = {"replaces": ADAPTED[t]}
    return o

items = [item(t) for t in order]
quick = [{"item": ids[t], "domain": d, "key": k} for (t, d, k) in MINI]
normal = [{"item": ids[t], "domain": FACTOR[f], "key": (-k if f == 4 else k)} for (t, f, k) in FFM50]
senior = [{"item": ids[NEO[f][k][0]], "domain": f[0], "facet": f, "key": NEO[f][k][1]} for k in range(4) for f in FACET_ORDER]

assert len(items) == 156, len(items)
assert len(quick) == 20 and len(normal) == 50 and len(senior) == 120

bank = {
 "instrument": "ipip-b5",
 "version": "0.1.0",
 "status": "experimental",
 "title": {"zh-CN": "大五人格（先行版）", "en": "Big Five (preview)"},
 "description": {
   "zh-CN": "大五人格模型用开放性、尽责性、外向性、宜人性和情绪敏感性（神经质）五个维度描述人格，是心理学研究中使用最广泛的人格模型。题目来自公有领域的国际人格题库（IPIP）。",
   "en": "The Big Five model describes personality with five broad dimensions — Openness, Conscientiousness, Extraversion, Agreeableness and Neuroticism — and is the most widely used model in personality research. Items come from the public-domain International Personality Item Pool (IPIP)."
 },
 "instructions": {
   "zh-CN": "下面每句话描述了人们的一些行为。请按照你现在通常的样子（而不是希望将来成为的样子）来判断每句话与你的符合程度，并与同性别、年龄相仿的人相比较，诚实地描述自己。",
   "en": "Describe yourself as you generally are now, not as you wish to be in the future. Describe yourself as you honestly see yourself, in relation to other people you know of the same sex as you are, and roughly your same age."
 },
 "source": {
   "zh-CN": "国际人格题库 IPIP（ipip.ori.org）：Mini-IPIP（Donnellan 等，2006）、IPIP 大五标记 50 题（Goldberg，1992）、IPIP-NEO-120（Johnson，2014）。",
   "en": "International Personality Item Pool (ipip.ori.org): Mini-IPIP (Donnellan et al., 2006), IPIP 50-item Big-Five factor markers (Goldberg, 1992), IPIP-NEO-120 (Johnson, 2014)."
 },
 "license": "Public domain (IPIP items); Chinese translation and adaptations CC-BY-SA-4.0",
 "licenseNote": {
   "zh-CN": "IPIP 的题目和量表属于公有领域，可以不经许可、免费使用（见 ipip.ori.org）。中文译文和改编题目由 MindScope 制作，以 CC BY-SA 4.0 发布。",
   "en": "IPIP items and scales are in the public domain and may be used without permission or fee (see ipip.ori.org). The Chinese translation and adapted items were made by MindScope and are released under CC BY-SA 4.0."
 },
 "translationNote": {
   "zh-CN": "中文由 MindScope 翻译（2026），尚未经过回译和人群验证；资深模式中“价值观开放”子维度的两道投票题已改为中性题目。结果仅供自我了解，与原版英文量表的研究结论不能直接对比。",
   "en": "Chinese translation by MindScope (2026), not yet back-translated or validated; in the senior form, the two voting items of the Liberalism facet were replaced with neutral items. Results are for self-understanding and are not directly comparable with research on the original English scales."
 },
 "citations": [
   "Goldberg, L. R. (1992). The development of markers for the Big-Five factor structure. Psychological Assessment, 4, 26-42.",
   "Donnellan, M. B., Oswald, F. L., Baird, B. M., & Lucas, R. E. (2006). The Mini-IPIP scales: Tiny-yet-effective measures of the Big Five factors of personality. Psychological Assessment, 18, 192-203.",
   "Johnson, J. A. (2014). Measuring thirty facets of the Five Factor Model with a 120-item public domain inventory: Development of the IPIP-NEO-120. Journal of Research in Personality, 51, 78-89.",
   "Goldberg, L. R., et al. (2006). The International Personality Item Pool and the future of public-domain personality measures. Journal of Research in Personality, 40, 84-96."
 ],
 "options": [
   {"value": 1, "label": {"zh-CN": "非常不符合", "en": "Very inaccurate"}},
   {"value": 2, "label": {"zh-CN": "比较不符合", "en": "Moderately inaccurate"}},
   {"value": 3, "label": {"zh-CN": "不确定", "en": "Neither accurate nor inaccurate"}},
   {"value": 4, "label": {"zh-CN": "比较符合", "en": "Moderately accurate"}},
   {"value": 5, "label": {"zh-CN": "非常符合", "en": "Very accurate"}}
 ],
 "scoring": {"engine": "likert-mean@1", "bands": [2.3333, 3.6667], "minAnsweredRatio": 0.75},
 "forms": {
   "quick": {"source": "Mini-IPIP", "citation": "Donnellan et al. (2006)", "facets": False, "entries": quick},
   "normal": {"source": "IPIP 50-item Big-Five factor markers", "citation": "Goldberg (1992)", "facets": False, "entries": normal},
   "senior": {"source": "IPIP-NEO-120", "citation": "Johnson (2014)", "facets": True, "entries": senior}
 },
 "items": items,
}
out = sys.argv[1]
with io.open(out, "w", encoding="utf-8", newline="\n") as f:
    json.dump(bank, f, ensure_ascii=False, indent=1)
    f.write("\n")
print("items", len(items), "quick", len(quick), "normal", len(normal), "senior", len(senior))
