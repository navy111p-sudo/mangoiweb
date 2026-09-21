/* BTS / SIU on-demand picture vocabulary. No account data, eager media, or server grading. */
(function(root){
  'use strict';
  function normalize(s){return String(s||'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[.,!?;:]/g,' ').replace(/\s+/g,' ').trim();}
  function blank(text,word){return text.replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g,function(token){return token.toLowerCase()===word.toLowerCase()?'_____':token;});}
  function shuffle(items,random){var out=items.slice();random=random||Math.random;for(var i=out.length-1;i>0;i--){var j=Math.floor(random()*(i+1)),v=out[i];out[i]=out[j];out[j]=v;}return out;}
  /* 🎨 낱말 그림카드 — 사진이 없는 낱말에도 «그림» 을 붙인다(2026-09-21 사장님 지시: 모든 낱말에 그림).
     ⛔ 사진이 없다고 «같은 교재의 다른 문장» 사진을 빌려 오지 마세요 — 「nice」 에 가방 사진이 붙던 길입니다.
        빌려 온 사진은 «이 낱말의 뜻» 으로 외워져 없는 것보다 나쁩니다. 그래서 «우리가 그리는 카드» 로 채웁니다.
     🔤 그림문자는 단일 코드포인트만 씁니다 — 이 저장소는 Unicode 13 이상 금지(Win10 두부)이고
        ZWJ 조합(👩‍🏫 류)도 옛 Win10 에서 쪼개져 보여서 아예 안 씁니다.
     ⛔ 이 표를 다른 파일에 복제하지 마세요 — 빌드도 회귀 검사도 이 파일을 읽습니다(정본 한 곳). */
  var PICTO_TABLE={
   '🍎':'apple fruit','🍚':'rice','🍞':'bread toast sandwich','🍜':'noodle ramen soup','🍰':'cake dessert pie',
   '🍫':'chocolate candy','🍪':'cookie snack','🥛':'milk','☕':'coffee tea cafe','🍽':'meal dinner dish plate supper',
   '🍳':'breakfast egg cook chef kitchen fry','🍕':'pizza','🍗':'chicken meat beef pork','🍔':'hamburger burger',
   '🥗':'salad vegetable lettuce','🍦':'cream dessert','🍌':'banana','🍇':'grape','🍓':'strawberry','🍉':'watermelon',
   '💧':'water thirsty wet liquid','🥤':'drink juice soda','😋':'delicious tasty taste sweet yummy flavor',
   '🔥':'hot heat grill burn fire','❄':'cold freeze snow','☀':'sun sunlight sunny bright daylight','🌻':'summer',
   '🌧':'rain rainy storm','⛅':'weather forecast cloud sky','🌙':'moon night tonight evening bedtime',
   '⭐':'star favorite special wonderful','🏆':'best win champion trophy prize award achieve victory',
   '🌈':'rainbow colorful','🌸':'flower spring blossom','🌳':'tree forest wood','🌱':'plant grow seed garden sprout',
   '🌊':'ocean sea wave beach','⛰':'mountain hill hiking climb','🏝':'island jeju resort','🌏':'world earth global international',
   '🏫':'school classroom classmate campus','🎒':'student backpack pupil','🎓':'teacher teach lesson education professor tutor graduate',
   '📚':'study learn library librarian textbook course curriculum','📖':'book read story novel page chapter',
   '📝':'homework assignment essay write note report draft','✏':'pencil pen','🎨':'art paint draw creative artist design colour color',
   '🔢':'math number count calculate digit','🔬':'science scientist research experiment laboratory','🗺':'map geography travel route direction',
   '📜':'history ancient century past tradition classic heritage','🎵':'music song sing melody tune','🎸':'guitar instrument band',
   '💃':'dance dancer ballet','🎬':'movie film video clip cinema','📺':'television show program broadcast',
   '📷':'photo photography picture camera image','🎮':'game play player arcade','⚽':'soccer ball football kick',
   '🏀':'basketball','🏐':'volleyball','🎾':'tennis','⚾':'baseball','🏊':'swim pool dive','🚴':'bicycle bike cycling ride',
   '🏃':'run jog race sprint','🤸':'exercise workout training gym fitness stretch','🧘':'yoga relax calm meditation wellness posture breathe',
   '🎯':'goal target aim focus purpose','💪':'strong strength healthy health fit power muscle','🏅':'grade score point medal rank',
   '😀':'happy smile glad joy cheerful pleased','😄':'fun funny laugh humour humor joke','🙂':'nice kind friendly polite gentle warm pleasant',
   '😢':'sad cry sorrow unhappy','😡':'angry mad furious','😱':'scary scared afraid fear frightened terrible',
   '😮':'surprise amazing amaze wonder incredible','😴':'sleep sleepy tired rest nap doze','🤒':'sick ill illness fever',
   '🏥':'hospital doctor nurse clinic patient','💊':'medicine medication pill drug cure','🦷':'teeth tooth dentist brush',
   '😷':'mask cough flu','🧴':'sunscreen skin lotion cream soap','🚿':'shower bath wash','🧹':'clean tidy sweep neat',
   '👀':'see look watch view observe notice','👂':'hear listen sound ear','🗣':'talk speak say tell speech pronounce',
   '💬':'conversation chat phrase word language english korean japanese chinese sentence','🙋':'ask question answer raise',
   '💡':'idea think thought imagine clever smart solve solution invent bright','🧠':'brain remember memory know understand mind learn',
   '📋':'list plan schedule routine timeline agenda checklist','✅':'check finish complete done accept correct confirm',
   '❓':'problem issue difficult hard trouble challenge question puzzle','🔁':'change exchange switch replace repeat again',
   '⏰':'time clock hour minute early late alarm','📅':'day date today tomorrow yesterday week month year season calendar weekend',
   '🌅':'morning afternoon sunrise dawn','🏠':'house home apartment room live building residence','🚪':'door gate entrance',
   '🛏':'bed bedroom pillow','🛋':'sofa furniture couch','💺':'chair seat','🚽':'bathroom toilet restroom',
   '👕':'shirt clothes clothing wear dress uniform','👖':'pants jeans trousers','👟':'shoes shoe sneaker boot',
   '🧥':'coat jacket leather scarf sweater','👓':'glasses lens','🎩':'hat cap','💍':'ring jewelry jewellery',
   '💰':'money cost price buy sell spend pay budget cash income','💳':'credit payment bank account','🛒':'shop shopping store market purchase',
   '🏬':'mall department center centre','🍴':'restaurant menu diner','🏢':'office company business work job career employee manager staff corporate',
   '🤝':'meet meeting friend friendship together team partner cooperate agreement support colleague',
   '👨':'man father dad boy male gentleman','👩':'woman mother mom girl female lady','👶':'baby child kid infant toddler',
   '👵':'grandmother grandma granny','👴':'grandfather grandpa grandparent','👪':'family parent brother sister sibling relative cousin',
   '❤':'love heart like affection care adore','🎂':'birthday anniversary','🎉':'party celebrate celebration festival event holiday',
   '🎁':'gift present surprise','💌':'letter mail postcard','📧':'email inbox','📞':'phone call smartphone telephone dial',
   '💻':'computer laptop software internet online technology digital app website program','🔌':'electricity power battery charge',
   '🚗':'car drive driver taxi vehicle','🚌':'bus coach','🚆':'train subway station railway metro','✈':'airplane plane flight fly travel trip journey tour vacation airport',
   '🧳':'luggage suitcase package delivery deliver parcel baggage','🏯':'temple castle shrine palace','🗾':'japan japanese tokyo kyoto',
   '🐶':'dog puppy pet','🐱':'cat kitten','🐰':'rabbit bunny','🐦':'bird wing','🐟':'fish','🐘':'elephant','🦁':'lion','🐻':'bear',
   '🐵':'monkey','🐴':'horse','🐮':'cow cattle','🐷':'pig','🐔':'hen rooster','🦋':'butterfly insect bug','🐝':'bee honey',
   '🐾':'animal creature wildlife','🍀':'luck lucky fortune','♻':'environment recycle preservation sustainable eco',
   '🌍':'climate nature planet','🧊':'ice frozen','🧺':'laundry basket','✂':'scissors cut trim','🔨':'make build fix repair tool hammer create construct',
   '🧱':'block brick wall','📦':'box container carton','🎤':'presentation present speaker announce microphone',
   '📊':'chart data result finding assessment statistic survey sale figure graph','📈':'increase improve growth progress rapid better rise develop advance',
   '📉':'decrease reduce decline less drop lower','💼':'professional interview client business suit',
   '📐':'design project measure angle corner shape','🧩':'piece part section detail element',
   '🚶':'walk go come step move arrive leave visit','🧑':'person people someone anyone everyone other adult human individual',
   '🤔':'decide decision choice choose prefer opinion advice recommend consider judge','📢':'news announce inform notice report media',
   '🧭':'way direction guide path route navigate','🗓':'semester quarter annual monthly weekly daily term',
   '🏕':'camp outdoor countryside picnic tent','🍁':'autumn fall','⛄':'winter snowman','🎄':'christmas',
   '🔊':'loud noise volume','🤫':'quiet silent calm','🚩':'start begin first launch','🛑':'stop end quit halt',
   '🆕':'new fresh modern recent','🧓':'old age elderly senior','🧒':'young younger youth childhood teen',
   '👫':'friends buddy companion','🕯':'candle light lamp','📏':'long short tall narrow wide size length measure big small large little huge tiny',
   '⚖':'balance compare fair equal justice weigh','🔍':'find search discover explore examine detail inspect',
   '🗝':'key secret access','🔒':'protect safe security privacy lock secure guard','⚠':'careful warning danger risk caution alert',
   '🙏':'thank thanks please sorry apologize grateful wish pray hope','👍':'good great fine okay ok yes agree well positive excellent',
   '👎':'bad poor wrong negative worse','✋':'stop hand hold touch use','🤗':'welcome hug greet hello',
   '👋':'hi hello goodbye bye wave greeting','🙇':'respect honor bow polite manner','🎪':'circus fair show',
   '🕰':'past future present moment','🌀':'difficult confuse complex complicated','🔆':'easy simple clear plain basic',
   '🧾':'bill receipt invoice record document form','📁':'file folder collection archive category',
   '🔗':'connect link relation network relationship','🌐':'web global network site',
   '🎟':'ticket entry admission','🥇':'first winner top leading','🎊':'congratulation cheer applaud',
   '🧮':'count calculate total sum amount','💭':'dream wish imagination fantasy','🪁':'kite',
   '🛡':'defend shield insurance protection','🤲':'give share offer provide donate charity volunteer help',
   '📥':'get receive take collect gather obtain','📤':'send deliver pass bring carry',
   '🔔':'remind alarm notice bell alert','🗳':'vote choose election poll','⚙':'system machine engine mechanical setting technique method process',
   '🧪':'chemistry test trial sample','🩺':'checkup diagnosis treatment therapy',
   '🎞':'scene episode series','🛠':'maintain service repair technique skill craft',
   '🎭':'character role act actor drama play theatre theater story',
   '🏛':'government law policy legislation right official public society social community civic',
   '🕊':'peace freedom free liberty','💯':'perfect complete full total whole entire',
   '🔤':'letter alphabet spelling vocabulary term'
  };
  /* 🎨 두 번째 벌 — 첫 벌에 없던 자주 쓰이는 낱말과 «불규칙 과거형»(went·ate·wrote …).
     ⛔ 같은 그림문자 열쇠를 첫 벌에 또 적으면 객체 리터럴이 앞엣것을 덮습니다. 그래서 벌을 나눕니다. */
  var PICTO_MORE={
   '🍽':'eat ate eaten food lunch brunch feed hungry appetite','🥤':'drank','🍚':'grain',
   '🔁':'always usually often sometimes never ever around again become happen turn cycle',
   '🌏':'country countries europe america asia africa nation abroad continent','🗺':'area region place location zone',
   '📍':'local nearby spot site position','🟢':'green','⚫':'black','⚪':'white grey gray','🟤':'brown',
   '🔴':'red','🔵':'blue','🟡':'yellow','🟠':'orange','🟣':'purple','🌸':'pink beautiful pretty lovely',
   '🦁':'brave bold courage','🙏':'want need wish hope beg desire please',
   '🔀':'different differ various diverse vary unlike',
   '⏰':"o'clock deadline wake awake schedule punctual",
   '📥':'keep hold store save collect kept','🏠':'stay remain settle indoor',
   '👪':'member members household','🤲':'have has had own belong possess',
   '📐':'middle centre model shape form structure','⚡':'fast quick rapid speed hurry swift',
   '📋':'prepare prepared ready arrange organize organized order setting',
   '🤝':'group crowd guest promise join joined together gather union',
   '💡':'interesting curious wonder insight breakthrough inspire',
   '🔢':'thirty twenty fifty fifteen twelve sixty ten eleven forty hundred thousand several many much lot lots amount dozen',
   '🗣':'explain explained discuss discussed describe mention comment reply spoke',
   '🧭':'front back side next last near far ahead behind beside direction',
   '🏢':'worker manage management agency firm organization department downtown employer',
   '🏛':'ethic principle rule law right policy legal legislation civic duty responsibility',
   '📈':'promotion raise gain profit benefit benefits advantage',
   '🏫':'class classroom grade course semester homeroom',
   '📉':'least minimum fewer lack shortage',
   '🚆':'platform rail commute','🧑':'folk single individual someone citizen',
   '✨':'fancy special elegant shiny wonderful',
   '👀':'perspective viewpoint sight vision glance',
   '✅':'authentic proper effective correct valid genuine real true right suitable',
   '🙇':'acknowledge apologize regret sorry humble',
   '🔬':'genomic genetic biology chemistry physics medical',
   '🤸':'practice drill rehearse train','⭐':'popular famous well known hit',
   '👩':'wife mom daughter aunt niece','👨':'husband son uncle nephew',
   '❤':'feel feeling emotion warmth passion',
   '⛰':'trail hike valley cliff rock','👶':'children childhood young baby',
   '🎭':'culture cultural character act role performance drama',
   '💻':'tablet device screen gadget','🍳':'homemade recipe bake baked grilled',
   '🛠':'workshop craft technique skill method tool maintain maintained service',
   '🎉':'exciting excited excite thrill cheer congratulate',
   '⚽':'sport sports athletic match league','🧩':'something anything everything nothing thing stuff item object',
   '🆕':'current recent latest today modern contemporary','💍':'wedding marry married marriage bride groom',
   '📝':'exam test quiz score paper form write wrote written record',
   '🔍':'review reviewed check inspect research examine study survey',
   '🏘':'neighborhood neighbour neighbor village community society',
   '🛣':'street road avenue path way lane','🌳':'park tree garden wood park',
   '😄':'enjoy enjoyed pleasure delight amusing entertaining',
   '🚪':'opportunity chance option choice entry access door open',
   '🚶':'went gone goes coming came arrive arrived leave left visit visited move',
   '📤':'took taken give gave given send sent bring brought carry deliver pass share',
   '👂':'heard listened','👁':'saw seen watched looked',
   '🧠':'knew known thought understood learned learnt remembered experience',
   '🗨':'told said spoke spoken talked speak','💰':'bought spent lent borrow lend loan cost paid sold',
   '🏃':'ran running jog move active','💺':'sat sit stand stood',
   '🔨':'made making built build create created produce',
   '💥':'broke broken break damage crash','🤔':'chose chosen choose decided decision',
   '👕':'wore worn wearing dress outfit','📚':'taught teaching textbook lesson',
   '🌅':'sunday monday tuesday wednesday thursday friday saturday weekday',
   '💪':'try tried attempt effort challenge strong practice',
   '🌱':'life live living alive grow born nature',
   '🎞':'fan follower supporter audience','🧊':'winter chill',
   '🕰':'still yet already soon later moment while',
   '🏆':'success successful achievement accomplish win won',
   '🧾':'note notes detail detailed list summary',
   '🎧':'listen music audio sound song','📶':'signal network connection wireless',
   '🧯':'safety emergency rescue','🧳':'trip tour travel journey vacation holiday',
   '🍀':'happy lucky chance fortune','🧃':'juice beverage',
   '🌤':'warm mild pleasant weather',
  };
  var PICTO_LAST={
   '🙏':'believe faith trust pray','📊':'feedback survey response evaluation','☀':'solar sunshine',
   '💡':'meaningful meaning significant purpose idea','⚖':'despite although however rather compare balance',
   '📝':'assign assigned task duty homework','❤':'heartfelt sincere warmhearted honest kindness',
   '🤝':'met host guest welcome hospitality','🧭':'across beyond through toward',
   '🧑':'personalized personal individual custom','📜':'traditional heritage custom folk',
   '🛒':'consumer customer buyer shopper','📈':'development developments improve advance progress',
   '⚖':'heavy weight load','❗':'important urgent serious necessary essential critical main major',
   '🧸':'soft gentle smooth fluffy comfortable cozy','🌳':'outside outdoor nature open air',
   '🎛':'control manage adjust operate handle setting','🗺':'adventure explore quest expedition',
   '🔁':'regularly routine habit regular frequent','⚡':'cause causes effect reason result impact',
   '💳':'card cards ticket pass','🔍':'found discover locate detect',
   '🎭':'genre style category kind type','💰':'expensive cheap discount sale bargain price',
   '🚪':'close closed shut open','⭐':'quality qualities excellent grade value',
   '🧠':'interest interested curious attention focus subject topic theme',
   '🌱':'natural nature organic fresh','📋':'require required need rule demand request',
   '🕊':'autonomy freedom independent liberty','📚':'intellectual academic knowledge wisdom',
   '💥':'conflict argue fight dispute tension','🗣':'interpersonal communicate social relationship',
   '🏠':'window wall roof floor stair','🌊':'deep depth bottom','❄':'cool chilly fresh',
   '✋':'put place set lay hold push pull','🧊':'cold ice frozen',
   '🥱':'boring dull tired','🎒':'bag backpack pack','🧢':'cap hat',
   '📏':'thick thin flat round square straight','🔆':'easy simple clear obvious plain',
   '🧗':'effort struggle overcome persist','🌟':'shine bright brilliant glow star','🔋':'energy power charge battery','🧲':'attract pull magnet',
   '🎰':'random chance luck','🚼':'safe child care nursery',
   '📣':'advertise promote campaign marketing','🏦':'bank finance financial loan',
   '⌛':'wait patience duration period'
  };
  var PICTO={};
  (function(){for(var t=0,tables=[PICTO_TABLE,PICTO_MORE,PICTO_LAST];t<tables.length;t++)for(var icon in tables[t]){var words=tables[t][icon].split(' ');for(var i=0;i<words.length;i++){var w=words[i];if(w&&!PICTO[w])PICTO[w]=icon;}}})();
  /* 갈래 표시 — «무슨 뜻인지» 가 아니라 «어떤 갈래인지» 만 나타낸다. 화면이 그렇게 말해야 한다(exact:false). */
  var PICTO_GROUPS=[[/(tion|sion|ment|ness|ity|ism|ship|hood|ance|ence)$/,'💭'],[/(room|house|land|town|shop|store|port|market)$/,'🏠'],[/(er|or|ist|ian|man|men)$/,'🧑'],[/(ing|ed)$/,'🏃'],[/(ful|ous|ive|able|ible|less|al|ic|ly|y)$/,'✨']];
  var PICTO_DEFAULT='🧩';
  /* 낱말의 기본형 후보 — 사전은 기본형만 담고 변형형은 여기서 되돌린다(books→book · happily→happy). */
  function pictoStems(word){
   var out=[word],add=function(x){if(x&&x.length>1&&out.indexOf(x)<0)out.push(x);};
   var apos=word.indexOf("'");if(apos>0)add(word.slice(0,apos));
   if(/ies$/.test(word))add(word.slice(0,-3)+'y');
   if(/ied$/.test(word))add(word.slice(0,-3)+'y');
   if(/ier$/.test(word))add(word.slice(0,-3)+'y');
   if(/iest$/.test(word))add(word.slice(0,-4)+'y');
   if(/(ches|shes|sses|xes|zes)$/.test(word))add(word.slice(0,-2));
   if(/es$/.test(word)){add(word.slice(0,-2));add(word.slice(0,-1));}
   if(/s$/.test(word)&&!/ss$/.test(word))add(word.slice(0,-1));
   if(/ing$/.test(word)){add(word.slice(0,-3));add(word.slice(0,-3)+'e');}
   if(/ed$/.test(word)){add(word.slice(0,-2));add(word.slice(0,-1));}
   if(/est$/.test(word)){add(word.slice(0,-3));add(word.slice(0,-3)+'e');}
   if(/er$/.test(word)){add(word.slice(0,-2));add(word.slice(0,-1));}
   if(/ly$/.test(word)){add(word.slice(0,-2));add(word.slice(0,-2)+'e');}
   if(/ness$/.test(word))add(word.slice(0,-4));
   if(/ment$/.test(word)){add(word.slice(0,-4));add(word.slice(0,-4)+'e');}
   if(/(tion|sion)$/.test(word)){add(word.slice(0,-4));add(word.slice(0,-4)+'e');}
   if(/ful$/.test(word))add(word.slice(0,-3));
   for(var i=out.length-1;i>=0;i--){var s=out[i];
    if(/([bcdfghjklmnpqrstvz])\1$/.test(s))add(s.slice(0,-1));
    if(/i$/.test(s))add(s.slice(0,-1)+'y');}
   return out;
  }
  /* 🎨 낱말 → 그림문자. exact=true 면 «이 낱말을 나타내는 그림», false 면 «갈래만 나타낸 기본 카드».
     ⛔ 갈래 그림문자를 «이 낱말의 그림» 이라고 말하지 마세요 — 그게 이 저장소가 두 번 밟은 함정입니다. */
  function pictogram(word){
   var w=String(word||'').toLowerCase().replace(/[^a-z']/g,'');
   if(!w)return {icon:PICTO_DEFAULT,exact:false};
   var forms=pictoStems(w);
   for(var i=0;i<forms.length;i++)if(PICTO[forms[i]])return {icon:PICTO[forms[i]],exact:true};
   for(var g=0;g<PICTO_GROUPS.length;g++)if(PICTO_GROUPS[g][0].test(w))return {icon:PICTO_GROUPS[g][1],exact:false};
   return {icon:PICTO_DEFAULT,exact:false};
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={normalize:normalize,blank:blank,shuffle:shuffle,pictogram:pictogram,PICTO:PICTO};return;}
  var $=function(id){return document.getElementById('cq-'+id);};
  var manifest=null,book=null,cache=new Map(),controller=null,requestId=0,mediaId=0,open=false;
  var isReview=false,finished=false;
  var mode='words',items=[],filtered=[],position=0,page=0,quiz=null,passed=false,assisted=false,attempted=false,score=0,combo=0,review=[],imageTimer=null,videoTimer=null;
  function tr(ko,en){return document.documentElement.lang==='en'?en:ko;}
  function set(id,value){$(id).textContent=value;}
  function current(){return items[position];}
  function scene(item){return book.scenes[item.scene];}
  /* 📖 교재 예문 = bookExample ?? 그림 문장. 그림이 바로 그 예문의 그림일 때는 같은 문장을 한 번만 싣는다(빌드가 지운다). */
  function example(item){return mode==='words'?(item.bookExample||scene(item).text||''):scene(item).text;}
  /* 🖼 2026-09-21 — 그림이 무엇을 보여 주는지 세 가지로 갈라 말한다. 옛 화면은 셋을 한 문구로 뭉쳐
     「Your backpack looks nice.」 의 가방 사진을 「nice」 의 그림처럼 보여 줬다(사장님 지적).
     word    = 그림 설명이 그 낱말을 가리킨다(근거 있음)
     context = 지금 보는 그 예문을 그린 그림이다(낱말 뜻 그림이 아니다)
     none    = 근거가 없어 아예 붙이지 않았다 */
  /* 🖼 그림은 셋 가운데 하나로 «반드시» 붙는다(2026-09-21 사장님 지시: 모든 낱말에 그림).
     word = 사진 설명이 그 낱말을 가리킨다 · context = 지금 보는 그 예문을 그린 사진 · card = 우리가 그린 낱말 그림카드
     ⛔ 'none'(빈 상자) 으로 되돌리지 마세요. ⛔ 빈자리를 «남의 문장 사진» 으로 채우지도 마세요. */
  function picKind(item){return item.pic?'word':(scene(item).image?'context':'card');}
  /* 🎨 그림카드 그리기 — 사진이 없을 때 상자를 채운다. 낱말마다 색이 달라 카드가 서로 구별된다.
     ⚠️ exact=false 면 «갈래만 나타낸 카드» 라고 말한다 — 갈래 그림문자를 낱말 뜻으로 읽게 두지 않는다. */
  function showWordCard(word){
   var card=$('wordcard'),art=pictogram(word),hue=0;
   for(var i=0;i<word.length;i++)hue=(hue*31+word.charCodeAt(i))%360;
   /* 🔒 퀴즈 중에는 카드에 답을 적지 않는다 — 예문은 빈칸으로 가리는데 카드가 답을 적으면 그 빈칸이 뜻을 잃는다.
      ⛔ 그림문자는 가리지 마세요 — 그것이 이 카드의 «그림» 이고 힌트로 쓰라고 있는 것입니다. */
   var shown=(!quiz||passed)?word:'_____';
   set('wordcard-icon',art.icon);set('wordcard-word',shown);
   set('wordcard-note',art.exact?tr('이 낱말을 나타내는 그림문자','A pictogram for this word'):tr('낱말 갈래를 나타내는 기본 카드','A basic card showing the word type'));
   card.style.background='linear-gradient(160deg,hsl('+hue+',46%,26%),hsl('+((hue+38)%360)+',42%,16%))';
   card.setAttribute('role','img');
   card.setAttribute('aria-label',art.icon+' '+shown+(art.exact?tr(' 낱말 그림카드',' word picture card'):tr(' 기본 낱말 카드',' basic word card')));
   card.hidden=false;return art;
  }
  function hideWordCard(){$('wordcard').hidden=true;}
  function difficulty(){var value=$('difficulty').value||'auto';return value==='auto'?({starter:'easy',growing:'standard',confident:'challenge'}[$('level').value]||'standard'):value;}
  function focusWord(item){var tokens=scene(item).text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)||[];return tokens.find(function(w){return !/^(a|an|the|i|you|he|she|it|we|they|is|are|was|were|am|to|of|and|his|her|their|my)$/i.test(w);})||tokens[0]||'';}
  function answer(item){return mode==='words'?item.word:(quiz&&difficulty()==='easy'?focusWord(item):scene(item).text);}
  function sectionItems(){var section=$('lesson').value||'all';return (mode==='words'?book.words:book.clips).filter(function(item){return section==='all'||Math.floor((item.sourceIndex-1)/10)===Number(section);});}
  function lessonOptions(){var selected=$('lesson').value||'all';$('lesson').replaceChildren();var all=document.createElement('option');all.value='all';all.textContent=tr('전체','All');$('lesson').append(all);var indices=book.words.concat(book.clips).map(function(x){return x.sourceIndex||1;});var count=Math.ceil(Math.max.apply(null,indices)/10);for(var i=0;i<count;i++){var option=document.createElement('option');option.value=String(i);option.textContent=tr('연습 구간 ','Practice section ')+(i+1)+' · '+(i*10+1)+'–'+((i+1)*10);$('lesson').append(option);}if(selected==='all'||Number(selected)<count)$('lesson').value=selected;set('lesson-note',tr('연습문장을 10개씩 나눈 구간입니다. 실제 교재 레슨 번호와의 연결은 아직 확인되지 않았어요.','Sections group every 10 source practice sentences. Their correspondence to textbook lessons is not yet verified.'));}
  function guidance(){var d=difficulty(),note=$('level').value==='starter'&&$('series').value!=='bts'?tr(' 기초 학생은 BTS 단어 연습부터 권장해요.',' For starters, begin with BTS word practice.'):'';set('guidance',tr('현재 도전: ','Current challenge: ')+({easy:tr('단어 빈칸 + 첫 글자 힌트','Word blanks + first-letter hint'),standard:tr('문장 첫 글자 힌트','Sentence initial-letter hints'),challenge:tr('문장 전체 쓰기','Write the whole sentence')}[d])+tr(' · 선택한 자료는 유지하고 도움의 양과 문제 순서를 조절해요.',' · Keeps your selected material; adjusts support and question order.')+note);}

  function stopMedia(){mediaId++;clearTimeout(imageTimer);clearTimeout(videoTimer);var v=$('video');v.pause();v.removeAttribute('src');v.removeAttribute('poster');v.load();v.hidden=true;$('watch').disabled=false;if(root.speechSynthesis)root.speechSynthesis.cancel();}
  function suspend(){stopMedia();if(current()){$('image').hidden=!$('image').getAttribute('src');if($('image').hidden&&mode==='words'&&picKind(current())==='card')showWordCard(current().word);}}
  function clearCard(){meanId++;set('meaning','');$('mean').disabled=false;stopMedia();$('image').removeAttribute('src');$('image').hidden=true;hideWordCard();$('card').hidden=true;}
  async function json(url,signal){var inner=new AbortController(),timedOut=false,abort=function(){inner.abort();};if(signal){if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});}var timer=setTimeout(function(){timedOut=true;inner.abort();},15000);try{var response=await fetch(url,{signal:inner.signal,credentials:'same-origin'});if(!response.ok)throw new Error('HTTP '+response.status);return await response.json();}catch(e){if(timedOut)throw new Error('Load timeout');throw e;}finally{clearTimeout(timer);if(signal)signal.removeEventListener('abort',abort);}}
  function bookOptions(){var list=manifest.books.filter(function(b){return b.series===$('series').value;});$('book').replaceChildren();list.forEach(function(b){var option=document.createElement('option');option.value=b.id;option.textContent=b.label+' · '+(b.series==='bts'?b.title:tr('보충 연습 묶음','Supplementary practice set'));$('book').append(option);});}
  /* ⛔ 「그림 연결 단어 4,469개」로 되돌리지 마세요 — 그건 «그림을 붙인 개수» 였고 그 대부분이 그 낱말을
     보여 주지 않았습니다(2026-09-21 실측: 붙인 39,762줄 중 38,475줄). 갈래를 갈라서 셉니다.
     ⛔ 세 숫자를 하나로 합치지 마세요 — 「사진」 과 「우리가 그린 카드」 가 같은 말이 됩니다. */
  function overview(){if(manifest)set('overview',manifest.books.length+tr('개 연습 묶음 · 낱말 그림 ',' practice sets · Word pictures ')+(manifest.wordPictureForms||0).toLocaleString()+tr('개 · 예문 상황 그림 ',' · Example-scene pictures ')+(manifest.contextOnlyForms||0).toLocaleString()+tr('개 · 낱말 그림카드 ',' · Word picture cards ')+(manifest.cardOnlyForms||0).toLocaleString()+tr('개 · 문장 영상 ',' · Sentence clips ')+manifest.clips.toLocaleString()+tr('편',''));}
  async function enter(){open=true;var epoch=++requestId;if(controller)controller.abort();controller=new AbortController();document.getElementById('intro').hidden=true;document.getElementById('curriculum').hidden=false;set('overview',tr('교재 목록을 불러오고 있어요…','Loading the book list…'));$('retry').hidden=true;
    try{if(!manifest){var data=await json('/data/scene-curriculum/v1/manifest.json',controller.signal);if(!open||epoch!==requestId)return;manifest=data;}if(!open)return;overview();if(!$('book').options.length)bookOptions();await loadBook();}catch(e){if(open&&epoch===requestId&&e.name!=='AbortError'){set('overview',tr('목록을 불러오지 못했어요. 연결을 확인하고 다시 눌러 주세요.','Could not load the list. Check your connection and retry.'));$('retry').hidden=false;}}
  }
  async function loadBook(){if(!manifest||!open)return;var id=$('book').value,epoch=++requestId;if(controller)controller.abort();controller=new AbortController();clearCard();book=null;quiz=null;$('result').hidden=true;$('browser').hidden=true;$('quiz').disabled=true;$('retry').hidden=true;$('progress').hidden=true;$('browse').hidden=true;set('count',tr('선택한 교재를 불러오는 중…','Loading your selected book…'));
    try{var data=cache.get(id);if(!data){data=await json('/data/scene-curriculum/v1/'+id+'.json',controller.signal);}if(epoch!==requestId||!open)return;if(!data||data.id!==id||!Array.isArray(data.words)||!data.scenes)throw new Error('Invalid book');cache.delete(id);cache.set(id,data);while(cache.size>3)cache.delete(cache.keys().next().value);book=data;mode=$('mode').value;lessonOptions();resetItems();}
    catch(e){if(epoch!==requestId||e.name==='AbortError'||!open)return;set('count',tr('이 교재를 불러오지 못했어요. 다시 시도해 주세요.','Could not load this book. Please retry.'));$('retry').hidden=false;}
  }
  function resetItems(){if(!book)return;quiz=null;mode=$('mode').value;items=sectionItems();guidance();filtered=items.slice();position=page=0;$('search').value='';$('result').hidden=true;$('progress').hidden=true;$('browse').hidden=true;$('quiz').hidden=false;$('quiz').disabled=!items.length;$('browser').hidden=false;set('count',book.label+' · '+items.length+tr(mode==='words'?'개 낱말 · 모든 낱말에 그림이 붙어요':'개 문장 영상',mode==='words'?' word forms · every word has a picture':' sentence clips'));renderCard();renderList();}
  function showImage(){if(!current())return;var s=scene(current()),img=$('image'),epoch=mediaId;clearTimeout(imageTimer);img.hidden=true;$('retry-image').hidden=true;
    hideWordCard();
    /* 🎨 사진이 없으면 «빈 상자 + 없다는 안내» 대신 우리가 그린 낱말 그림카드를 붙인다(모든 낱말에 그림).
       ⛔ 여기서 다른 문장의 사진을 끌어오지 마세요 — 「nice」 에 가방 사진이 붙던 길입니다.
       ⛔ 「!s.image」 로 카드를 그리지 마세요 — 갈래 정본이 둘이 되어 picKind 를 되돌려도 아무도 못 봅니다
          (2026-09-21 변이시험 실측: 그 상태에서 picKind 를 옛 'none' 으로 되돌려도 하니스가 전부 초록이었습니다). */
    if(!s.image){img.removeAttribute('src');set('placeholder','');if(mode==='words'&&picKind(current())==='card'&&current().word)showWordCard(current().word);else set('placeholder',tr('이 장면의 그림이 아직 없어요. 예문으로 익혀 보세요.','No picture for this scene yet. Learn it from the example.'));return;}
    set('placeholder',tr('그림을 불러오는 중…','Loading picture…'));img.onload=function(){if(epoch!==mediaId)return;clearTimeout(imageTimer);img.hidden=false;set('placeholder','');};img.onerror=function(){if(epoch!==mediaId)return;clearTimeout(imageTimer);img.hidden=true;set('placeholder','');if(mode==='words'&&current()&&current().word)showWordCard(current().word);else set('placeholder',tr('그림을 불러오지 못했어요. 예문과 힌트로 계속할 수 있어요.','Picture unavailable. Continue with the example and hints.'));$('retry-image').hidden=false;};img.alt=picKind(current())==='word'?tr('그림 설명에 이 낱말이 들어 있는 AI 그림','AI picture whose description names this word'):tr('예문의 상황을 보여 주는 AI 상황 이미지','AI context image for the example');img.src=s.image;imageTimer=setTimeout(function(){if(epoch===mediaId&&!img.complete){set('placeholder',tr('그림이 늦게 도착하고 있어요. 예문으로 먼저 연습해도 좋아요.','The picture is taking longer. You can start with the example.'));$('retry-image').hidden=false;}},12000);
  }
  function renderExample(item,revealed){var s=scene(item),d=difficulty(),ex=example(item),text=mode==='words'?(quiz&&!revealed?blank(ex,item.word):ex):(quiz&&!revealed&&d==='easy'?blank(s.text,focusWord(item)):quiz&&!revealed&&d==='challenge'?tr('그림이나 영상을 보고 배운 문장을 써 보세요.','Use the picture or clip to write the sentence you studied.'):quiz&&!revealed?s.text.split(/\s+/).map(function(w){return w[0]+w.slice(1).replace(/[a-z]/gi,'_');}).join(' '):s.text);set('example',text);
    /* 그림이 다른 문장에서 왔을 때만 그 문장을 함께 적는다 — 그림과 예문이 다르다는 사실을 감추지 않는다.
       ⛔ 남의 교재 문장은 payload 에 아예 없다(빌드가 뺀다) → 여기서 수준이 안 맞는 문장이 새지 않는다. */
    var shot=mode==='words'&&s.text&&s.text!==ex?s.text:'';
    set('book-example',shot?tr('그림 속 문장: ','Sentence behind the picture: ')+(quiz&&!revealed?blank(shot,item.word):shot):'');
    if(mode==='words'&&(!quiz||revealed)){var rx=/[A-Za-z]+(?:'[A-Za-z]+)?/g,last=0,match; $('example').replaceChildren();while((match=rx.exec(ex))){$('example').append(document.createTextNode(ex.slice(last,match.index)));if(match[0].toLowerCase()===item.word){var mark=document.createElement('mark');mark.textContent=match[0];$('example').append(mark);}else $('example').append(document.createTextNode(match[0]));last=rx.lastIndex;}$('example').append(document.createTextNode(ex.slice(last)));}
  }
  function renderCard(){clearCard();var item=current();if(!item){set('count',tr('이 조건에 맞는 콘텐츠가 없어요. 다른 교재나 연습 종류를 골라 주세요.','No content matches. Choose another book or practice type.'));return;}
    $('card').hidden=false;passed=assisted=attempted=false;var s=scene(item);set('kind',mode==='words'?tr('WORD · 예문 속 단어','WORD · IN CONTEXT'):tr('SENTENCE · 상황 영상','SENTENCE · CONTEXT CLIP'));set('target',quiz?tr(mode==='words'?'빈칸의 단어를 써 보세요.':'영상을 보고 문장을 완성하세요.',mode==='words'?'Type the missing word.':'Complete the sentence after watching.'):(mode==='words'?item.word:tr('장면을 보고 읽어 보세요.','Watch, then read the sentence.')));renderExample(item,false);
    var kind=mode==='words'?picKind(item):'context';
    set('source',mode!=='words'?tr('상황 영상: ','Context clip: ')+s.source:
      kind==='word'?tr('🖼 낱말 그림 · 그림 설명에 「'+item.word+'」가 들어 있어요 · ','🖼 Word picture · its description names “'+item.word+'” · ')+s.source:
      kind==='context'?tr('🏞 예문 상황 그림 · 지금 이 예문을 그린 그림이에요(낱말 뜻 그림은 아니에요) · ','🏞 Example-scene picture · it illustrates this example, not the word’s meaning · ')+s.source:
      tr('🎨 낱말 그림카드 · 이 낱말의 사진이 없어 그림문자로 그린 카드예요(사진이 아니에요) · ','🎨 Word picture card · no photo for this word, so it is drawn as a pictogram (not a photo) · ')+s.source);
    set('media-status',mode!=='words'?tr('문장 속 상황을 보여 주는 영상이에요.','A clip of the situation in the sentence.'):
      kind==='word'?tr('AI 그림 · 그림 설명이 이 낱말을 가리켜요.','AI picture · its description names this word.'):
      kind==='context'?tr('AI 상황 그림 · 낱말 뜻은 예문과 「뜻 보기」로 확인해요.','AI scene picture · check the meaning with the example and “Meaning”.'):
      tr('그림문자 카드 · 정확한 뜻은 예문과 「뜻 보기」로 확인해요.','Pictogram card · check the exact meaning with the example and “Meaning”.'));
    $('mean').hidden=!!quiz||mode!=='words';set('meaning','');
    $('watch').hidden=mode!=='videos'||!s.video;$('photo').hidden=$('watch').hidden;$('answer-form').hidden=!quiz;$('hint').hidden=!quiz;$('reveal').hidden=!quiz;$('listen').hidden=!!quiz;$('next').hidden=!!quiz;$('answer').value='';$('answer').disabled=false;$('submit').disabled=false;$('hint').disabled=false;$('reveal').disabled=false;set('feedback',quiz&&difficulty()==='easy'?answer(item)[0]+'…':'');showImage();if(quiz)progress();
  }
  /* 🗣 «뜻» 은 사전을 지어내지 않는다 — 학생 화면이 이미 쓰는 /api/translate mode:'learn'(의역) 한 곳에 묻는다.
     ⛔ 낱말만 따로 번역하지 않는다(맥락이 없으면 「Good job!」 → 「훌륭한 직업!」 류가 된다). 예문째로 묻는다. */
  var meanings=new Map(),meanId=0;
  async function showMeaning(){var item=current();if(!item||mode!=='words')return;var text=example(item),epoch=++meanId;
    if(meanings.has(text)){set('meaning',tr('뜻: ','Meaning: ')+meanings.get(text));return;}
    set('meaning',tr('뜻을 불러오는 중…','Loading the meaning…'));$('mean').disabled=true;
    var inner=new AbortController(),timer=setTimeout(function(){inner.abort();},15000);
    try{var r=await fetch('/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},signal:inner.signal,body:JSON.stringify({texts:[text],target:'ko',mode:'learn'})});
      if(!r.ok)throw new Error('HTTP '+r.status);var d=await r.json(),ko=d&&d.map&&d.map[text];
      if(epoch!==meanId)return;if(!ko||ko===text)throw new Error('no translation');
      meanings.set(text,ko);set('meaning',tr('뜻: ','Meaning: ')+ko);
    }catch(e){if(epoch===meanId)set('meaning',tr('뜻을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.','Could not load the meaning. Please try again.'));}
    finally{clearTimeout(timer);if(epoch===meanId)$('mean').disabled=false;}}
  function progress(){set('count',(position+1)+' / '+items.length+' · ★ '+score+' · '+combo+' COMBO');$('progress-bar').style.width=(position/items.length*100)+'%';}
  function renderList(){var term=normalize($('search').value);filtered=items.filter(function(item){return normalize(answer(item)).includes(term);});var pages=Math.max(1,Math.ceil(filtered.length/12));page=Math.min(page,pages-1);$('items').replaceChildren();filtered.slice(page*12,page*12+12).forEach(function(item){var b=document.createElement('button');b.type='button';b.textContent=answer(item);b.setAttribute('aria-current',String(item===current()));b.addEventListener('click',function(){position=items.indexOf(item);renderCard();renderList();});$('items').append(b);});set('page-label',(page+1)+' / '+pages+' · '+filtered.length+tr('개',' items'));$('prev-page').disabled=page===0;$('next-page').disabled=page+1>=pages;}
  function remember(item){if(review.indexOf(item)<0)review.push(item);}
  function finish(){if(finished)return;finished=true;clearCard();$('progress').hidden=true;$('result').hidden=false;$('result').replaceChildren();var strong=document.createElement('strong');strong.textContent='★ '+score;$('result').append(strong,document.createTextNode(tr('도전 완료! 다시 연습할 표현 ','Challenge complete! Expressions to review: ')+review.length));if(review.length){var b=document.createElement('button');b.type='button';b.textContent=tr('어려웠던 표현 다시 도전','Retry tricky expressions');b.addEventListener('click',function(){startQuiz(review.slice());});$('result').append(document.createElement('br'),b);}if(!isReview&&root.parent!==root)root.parent.postMessage({type:'mangoi-game-complete',game:'scenequest',score:score},location.origin);set('count',tr('끝까지 해냈어요. 발음도 한 번 더 따라 해 보세요.','You finished! Say the expressions once more.'));}
  function startQuiz(deck){if(!book||!items.length)return;stopMedia();var pool=shuffle(sectionItems());if(($('level').value||'growing')==='starter')pool.sort(function(a,b){return (mode==='words'?a.word.length:scene(a).text.length)-(mode==='words'?b.word.length:scene(b).text.length);});else if($('level').value==='confident')pool.sort(function(a,b){return (mode==='words'?b.word.length:scene(b).text.length)-(mode==='words'?a.word.length:scene(a).text.length);});items=deck||pool.slice(0,10);quiz=true;finished=false;isReview=!!deck;position=score=combo=0;review=[];$('browser').hidden=true;$('quiz').hidden=true;$('browse').hidden=false;$('progress').hidden=false;$('result').hidden=true;renderCard();}
  function submit(e){e.preventDefault();if(e.isComposing||!quiz||passed||!current())return;var value=normalize($('answer').value);if(!value){set('feedback',tr('영어로 먼저 입력해 주세요.','Type your answer first.'));return;}if(value!==normalize(answer(current()))){attempted=true;combo=0;remember(current());set('feedback',tr('다시 살펴볼까요? 빈칸과 첫 글자 힌트를 확인해 보세요.','Try again. Check the blank and first-letter hint.'));progress();return;}passed=true;combo=assisted||attempted?0:combo+1;var gain=assisted?0:50+combo*10;score+=gain;$('answer').disabled=true;$('submit').disabled=true;$('hint').disabled=true;$('reveal').disabled=true;$('listen').hidden=false;$('next').hidden=false;renderExample(current(),true);if(mode==='words'&&picKind(current())==='card')showWordCard(current().word);set('feedback',assisted?tr('배웠어요! 복습 목록에 담았어요.','Learned! Added to review.'):tr('정답! +','Correct! +')+gain+' ★');progress();$('next').focus({preventScroll:true});}
  async function watch(){if(!open||!current())return;stopMedia();var epoch=mediaId,s=scene(current()),v=$('video');if(!s.video)return;v.poster=s.image||'';v.src=s.video;v.hidden=false;v.muted=true;$('watch').disabled=true;set('media-status',tr('영상을 불러오는 중… 그림과 예문으로 먼저 연습할 수 있어요.','Loading clip… You can start with the picture and example.'));
    videoTimer=setTimeout(function(){if(epoch!==mediaId)return;suspend();set('media-status',tr('영상 연결이 늦어지고 있어요. 그림으로 계속하거나 다시 재생해 주세요.','The clip is taking too long. Continue with the picture or retry.'));},15000);
    try{await v.play();if(epoch!==mediaId||!open)return;clearTimeout(videoTimer);$('image').hidden=true;$('watch').disabled=false;set('media-status',tr('문장 속 상황을 살펴보세요. 재생 버튼으로 다시 볼 수 있어요.','Watch the situation. Press play to watch again.'));}catch(e){if(epoch!==mediaId)return;suspend();set('media-status',tr('영상을 재생하지 못했어요. 그림과 예문으로 계속하거나 다시 재생해 주세요.','Clip unavailable. Continue with the picture and example, or retry.'));}
  }
  $('open').addEventListener('click',enter);$('close').addEventListener('click',function(){open=false;requestId++;if(controller)controller.abort();clearCard();document.getElementById('curriculum').hidden=true;document.getElementById('intro').hidden=false;});
  $('series').addEventListener('change',function(){if(manifest){bookOptions();loadBook();}});$('book').addEventListener('change',loadBook);$('mode').addEventListener('change',resetItems);$('lesson').addEventListener('change',resetItems);$('level').addEventListener('change',resetItems);$('difficulty').addEventListener('change',resetItems);$('retry').addEventListener('click',function(){if(manifest)loadBook();else enter();});$('quiz').addEventListener('click',function(){startQuiz();});$('browse').addEventListener('click',resetItems);
  $('search').addEventListener('input',function(){page=0;renderList();});$('prev-page').addEventListener('click',function(){page--;renderList();});$('next-page').addEventListener('click',function(){page++;renderList();});$('next').addEventListener('click',function(){if(quiz&&(!passed||finished))return;if(quiz&&position+1>=items.length){finish();return;}position=(position+1)%items.length;renderCard();if(!quiz)renderList();});
  $('answer-form').addEventListener('submit',submit);$('answer').addEventListener('keydown',function(e){if(e.key==='Enter'&&e.isComposing)e.preventDefault();});$('hint').addEventListener('click',function(){if(!quiz||passed)return;assisted=true;combo=0;remember(current());set('feedback',answer(current()).split(' ').map(function(w){return w[0]+w.slice(1).replace(/[a-z]/gi,'_');}).join(' '));progress();});$('reveal').addEventListener('click',function(){if(!quiz||passed)return;assisted=true;combo=0;remember(current());set('feedback',answer(current())+' · '+tr('직접 입력해 보세요.','Type it yourself.'));progress();});
  $('listen').addEventListener('click',function(){if(!current()||(quiz&&!passed)||!root.speechSynthesis)return;suspend();var u=new SpeechSynthesisUtterance(answer(current()));u.lang='en-US';u.rate=.85;root.speechSynthesis.speak(u);});$('mean').addEventListener('click',showMeaning);$('watch').addEventListener('click',watch);$('photo').addEventListener('click',function(){suspend();showImage();});$('retry-image').addEventListener('click',showImage);
  $('video').addEventListener('error',function(){if(open&&$('video').getAttribute('src')){suspend();set('media-status',tr('영상 연결을 확인해 주세요. 그림과 예문으로 계속할 수 있어요.','Check your video connection. You can continue with the picture and example.'));}});
  document.getElementById('back').addEventListener('click',function(){if(open){document.getElementById('curriculum').hidden=true;document.getElementById('intro').hidden=false;}open=false;requestId++;if(controller)controller.abort();clearCard();});document.getElementById('ui-lang').addEventListener('click',function(){if(open){overview();if(book){if(quiz){progress();guidance();}else{lessonOptions();resetItems();}}}});document.addEventListener('visibilitychange',function(){if(document.hidden)suspend();});root.addEventListener('pagehide',suspend);
  try{if(root.frameElement){var observer=new MutationObserver(function(){if(root.frameElement.getClientRects().length===0)suspend();});for(var el=root.frameElement;el;el=el.parentElement)observer.observe(el,{attributes:true,attributeFilter:['style','class','hidden']});}}catch(e){}
})(typeof window!=='undefined'?window:this);
