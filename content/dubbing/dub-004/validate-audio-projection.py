"""Validate supplied timing metadata; optionally apply to nonpublic draft only.
Does not fetch, inspect, synthesize, upload or certify any media.
"""
import argparse, csv, json
from pathlib import Path
P=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');args=parser.parse_args()
read=lambda name:json.loads((P/name).read_text())
meta=read('actual-voice-timing-projection.json');ep=read('episode.draft.json')
assert meta['type']=='derived_metadata_projection_not_lossless_full_manifest'
assert (meta['durationSec'],meta['sceneDurationSec'],meta['sampleRate'],meta['lineCount'])==(240,40,48000,60)
assert len(ep['scenes'])==6 and sum(s['durationSec'] for s in ep['scenes'])==240
assert len(meta['rows'])==60
rows={};last={};counts={};crossings=[]
for r in meta['rows']:
 sn=r['scene'];assert isinstance(sn,int) and 1<=sn<=6
 assert r['lineId'] not in rows;rows[r['lineId']]=r
 s=ep['scenes'][sn-1];assert s['durationSec']==40
 line=next(l for l in s['lines'] if l['id']==r['lineId'])
 for key in ['speaker','en','ko']:assert line[key]==r[key],(r['lineId'],key)
 assert r['speaker'] in ep['playable']
 assert 0<=r['start']<r['end']<=40
 sf,ef=r['startFrame48k'],r['endFrame48k'];assert isinstance(sf,int) and isinstance(ef,int)
 assert 0<=sf<ef<=40*48000
 assert abs(r['start']*48000-sf)<1e-6 and abs(r['end']*48000-ef)<1e-6
 assert sf>=last.get(sn,0),(r['lineId'],'overlap');last[sn]=ef
 assert r['voiceFilename']==f'scene-{sn}/{r["lineId"]}.wav'
 counts[sn,r['speaker']]=counts.get((sn,r['speaker']),0)+1
 for cut in [10,20,30]:
  if r['start']<cut<r['end']:crossings.append({'lineId':r['lineId'],'cutSec':cut,'scene':sn})
assert set(rows)=={l['id'] for s in ep['scenes'] for l in s['lines']}
assert all(counts.get((sn,c))==2 for sn in range(1,7) for c in ep['playable'])
assert ep['status']=='preview' and ep['timing']=='provisional'
index=json.loads((P/'../../../cloudflare-deploy/public/data/dubbing/index.json').resolve().read_text())
assert next(e for e in index['episodes'] if e['id']=='dub-004')['status']=='coming'
if args.apply:
 for s in ep['scenes']:
  for l in s['lines']:
   r=rows[l['id']];l.update(start=r['start'],end=r['end'])
 ep['note']={'ko':'음성 타이밍 메타데이터 반영 · 전체 3D 영상 미완성 · 청취·입모양 검수 전','en':'Voice timing metadata applied · full 3D video incomplete · listening and lip-sync QA pending'}
 plan=read('production-plan.json')
 plan['timingSource']=meta['source'];plan['timingSourceVersion']=meta['sourceVersion']
 plan['timingStatus']='audio metadata only; provisional video timing, no media QA'
 plan['shotBoundaryReviewRequired']=crossings
 for s in plan['scenes']:
  sr=[r for r in meta['rows'] if r['scene']==s['no']]
  s['dialogueWindows']=[{**{k:r[k] for k in ['speaker','start','end','startFrame48k','endFrame48k']},'lineId':r['lineId'],'status':'actual voice metadata; not verified video sync'} for r in sr]
  for shot in s['shots']:
   shot['dialogueIds']=[r['lineId'] for r in sr if r['start']<shot['end'] and r['end']>shot['start']]
   shot['timingNote']='10-second visual shot boundary is a draft; preserve full utterance across cuts or revise cuts. Never truncate audio.'
 audio=read('audio-requests.json');audio['status']='already_generated_by_media_owner_do_not_regenerate';audio['timingSource']=meta['source'];audio['note']='Delivered metadata imported; binary audio access still blocked. Original requests retained as provenance, not a pending synthesis queue. No generation authorized here.'
 for req in audio['requests']:
  r=rows[req['lineId']];req.update(plannedStart=r['start'],plannedEnd=r['end'],startFrame48k=r['startFrame48k'],endFrame48k=r['endFrame48k'],voiceFilename=r['voiceFilename'],status='reported_generated_asr_compared; binary_not_verified_here')
 for name,obj in [('episode.draft.json',ep),('production-plan.json',plan),('audio-requests.json',audio)]: (P/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
 with (P/'dialogue.csv').open('w') as f:
  w=csv.writer(f);w.writerow(['scene','id','speaker','start_audio_metadata','end_audio_metadata','en','ko','emotion'])
  for s in ep['scenes']:
   for l in s['lines']:w.writerow([s['no'],l['id'],l['speaker'],l['start'],l['end'],l['en'],l['ko'],l['emotion']])
report={'status':'PASS_METADATA_ONLY','lines':60,'scenes':6,'sceneSec':40,'totalSec':240,'sampleRate':48000,'speakerTextIdMatches':60,'sampleFramePairsMatch':60,'overlaps':0,'outOfRange':0,'shotBoundaryCrossings':crossings,'ready':False,'mediaAccess':'HTTP403 preserved; no retry','notVerified':['audio files/checksums','listening','ASR rerun','lip sync','video completion/playback','actual mic/scoring/export']}
(P/'AUDIO-METADATA-VALIDATION.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(f'PASS metadata: 60 IDs/speakers/bilingual texts; 6x40=240 sec; 60 sample-frame pairs; no overlaps/range errors. {len(crossings)} draft 10s cuts cross speech and require editing review. ready=false.')
