import { fail } from './team-store.js';
const number = v => typeof v === 'number' && Number.isFinite(v);
export function locationConfig(value) {
  if (!value || value.latitude === '' || value.longitude === '') return null;
  const {latitude,longitude,radius,required}=value;
  if (!number(latitude)||Math.abs(latitude)>90||!number(longitude)||Math.abs(longitude)>180||!number(radius)||radius<50||radius>1000||typeof required!=='boolean') fail('Enter valid branch coordinates and a radius between 50 and 1,000 metres.');
  return {latitude,longitude,radius,required};
}
export function checkLocation(input, config, branch, at=Date.now()) {
  const base={branch,at,status:'unavailable'};
  if (!input || !number(input.latitude)||Math.abs(input.latitude)>90||!number(input.longitude)||Math.abs(input.longitude)>180||!number(input.accuracy)||input.accuracy<0||!number(input.timestamp)||Math.abs(at-input.timestamp)>60000) {
    base.status=input?.status==='denied'?'denied':'unavailable';
  } else {
    Object.assign(base,{latitude:input.latitude,longitude:input.longitude,accuracy:Math.round(input.accuracy)});
    if (!config) base.status='unconfigured';
    else {
      const rad=x=>x*Math.PI/180;
      const a=Math.sin(rad(input.latitude-config.latitude)/2)**2+Math.cos(rad(config.latitude))*Math.cos(rad(input.latitude))*Math.sin(rad(input.longitude-config.longitude)/2)**2;
      base.distance=Math.round(6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a))));
      base.radius=config.radius;
      base.status=input.accuracy>Math.min(100,config.radius)?'inaccurate':base.distance+input.accuracy<=config.radius?'near':base.distance-input.accuracy>config.radius?'outside':'inaccurate';
    }
  }
  if (config?.required && base.status!=='near') fail(base.status==='outside'?'Your phone location is outside this branch. Check the branch name and try again at the branch.':'A fresh, accurate location near this branch is required. Allow location access, move near a window and try again.');
  return base;
}
