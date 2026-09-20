"""Measure real transcription separately from five-reader HTTP responsiveness."""
import argparse
import concurrent.futures
import json
import resource
import time
import urllib.request
from backend.app.adaptive.media import transcribe

def main():
    parser=argparse.ArgumentParser();parser.add_argument('recording');parser.add_argument('--base-url',default='http://127.0.0.1:8000');args=parser.parse_args()
    samples=[]
    def reader():
        times=[]
        for _ in range(10):
            start=time.monotonic()
            with urllib.request.urlopen(args.base_url+'/health',timeout=10) as r:
                if r.status!=200:raise RuntimeError('Unhealthy API')
                r.read()
            times.append(time.monotonic()-start);time.sleep(.2)
        return times
    start=time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures=[executor.submit(reader) for _ in range(5)]
        segments=transcribe(args.recording,'benchmark')
        for f in futures:samples.extend(f.result())
    print(json.dumps({'transcription_seconds':time.monotonic()-start,'segments':len(segments),'peak_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'health_p95_seconds':sorted(samples)[int(.95*(len(samples)-1))],'note':'Also run full learner journeys and inspect EC2 CPUCreditBalance; health checks alone do not establish capacity.'},indent=2))

if __name__=='__main__':main()
