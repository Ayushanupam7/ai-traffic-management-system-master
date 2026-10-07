











FACULTY OF ENGINEERING AND NATURAL SCIENCES


CAPSTONE FINAL REPORT


AI-BASED SMART TRAFFIC MONITORING AND MANAGEMENT SYSTEM


Mohammed Ahmed Mohammed Al-Labani, Artificial Intelligence Engineering
Abdullah Hani Abdellatif Al-Shobaki, Artificial Intelligence Engineering
Mohamed Aiman Mohamed Alkhozendar, Artificial Intelligence Engineering
Mohamed Dribika, Artificial Intelligence Engineering
Omar Kamal Burhan Jayyusi, Artificial Intelligence Engineering
Abdullah Shaher Salamoun, Artificial Intelligence Engineering

Advisors: 
Prof. Murat Goksin, Artificial Intelligence Engineering 
Prof. Fatih Kahraman, Artificial Intelligence Engineering



Istanbul, June 2026


STUDENT DECLARATION
By submitting this capstone project report, we declare that the work presented is the original work of the project team and has been prepared in accordance with the academic integrity regulations of Bahçeşehir University.

All system design decisions, methodological choices, and technical descriptions in this document were developed, reviewed, and validated by the project team. Any material, ideas, or content that are not our own have been properly acknowledged through appropriate citation.

We confirm that no unpermitted assistance was received in the design, development, or writing of this report, and that credit has not been falsely assigned or misrepresented among team members. We accept full responsibility for the accuracy, originality, and academic integrity of the content presented in this document.
 
DECLARATION OF AI USAGE
This project report was developed with the assistance of generative AI tools (e.g., ChatGPT, Copilot, Gemini, Claude, etc.). The use of AI in this work was limited to the following activities:
•	Brainstorming and idea generation
•	Literature search and summarization
•	Grammar and language editing
•	Code generation and debugging assistance
•	Data analysis support
•	Other (please specify): Report section drafting and content structuring based on project documentation, session logs, and experimental results produced by the team.

Validation and Authorship I certify that:
•	I have personally verified all facts, citations, and data points provided by the AI.
•	I have not simply copied and pasted AI outputs; all final text is my own writing or a significant rewrite of AI suggestions.
•	I accept full responsibility for the integrity and accuracy of this report.
 
Project Team
Department 1	: Artificial Intelligence Engineering
Member 1	: Abdullah Hani Abdellatif Al-Shobaki
Member 2	: Abdullah Shaher Salamoun
Member 3	: Mohamed Aiman Mohamed Alkhozendar
Advisor 	: Prof. Murat Goksin
Department 2	: Artificial Intelligence Engineering
Member 1	: Mohammed Ahmed Mohammed Al-Labani
Member 2	: Mohamed Dribika
Member 3	: Omar Kamal Burhan Jayyusi
Advisor 	: Prof. Fatih Kahraman














ABSTRACT
Urban traffic congestion remains a critical challenge in modern cities, where fixed-time signal control fails to respond to dynamic demand patterns, resulting in inefficient intersection throughput, delayed emergency response, and increased road safety risks. This project addresses these limitations through the design, implementation, and evaluation of an AI-based adaptive traffic management system that integrates microscopic traffic simulation, deep-learning computer vision, and a unified real-time monitoring platform.
The system is organized around two cooperating subsystems. The simulation and control subsystem models a 3×2 arterial road network of six intersections in SUMO, implementing an actuated signal control policy that redistributes green time based on live per-lane queue measurements, alongside a fixed-time baseline for reproducible comparison. An optional CARLA bridge provides photorealistic 3D visualization and camera-sensor testing. A FastAPI backend with WebSocket broadcasting connects the simulation engine to a Next.js dashboard supporting live monitoring, policy tuning, emergency vehicle preemption, and an embedded AI assistant. All tick-level simulation snapshots, race-mode experiment outcomes, and named policy variants are persisted to a Supabase Postgres database through batched asynchronous writes, making every experiment independently reproducible from logged parameters. The computer vision subsystem is built around a custom-trained YOLOv11m detector trained on a CARLA-generated synthetic dataset covering seven vehicle classes, paired with ByteTrack multi-object tracking and an analytics pipeline providing lane-level speed estimation, queue counting, red-light and chevron violation detection, highway entry counting, and collision detection.
Quantitative evaluation across three demand profiles — balanced, asymmetric, and extreme — confirms that the actuated policy reduces network clearance time by 40–54% over the fixed-time baseline, with a structural chokepoint at intersections B0 and B1 identified and documented. The YOLOv11m model achieves mAP50 of 0.949 and mAP50-95 of 0.865, with precision of 0.97 and recall of 0.90 on a held-out test set. ByteTrack tracking yields MOTA of 0.78 and IDF1 of 0.88 across 47,014 detections with only 47 ID switches, and the combined pipeline runs at 27.7 FPS on consumer-grade hardware, exceeding the 20 FPS real-time target. In CARLA mode, the system can additionally source an intersection’s queue length and emergency-vehicle state from the vision pipeline in place of the simulator’s ground truth, demonstrating perception-driven adaptive signal control on rendered camera feeds.
The project demonstrates that adaptive signal control driven by real-time computer vision is both technically feasible and practically deployable on commodity hardware. Key contributions include a reproducible simulation-based evaluation framework, a synthetic data pipeline for fine-grained emergency vehicle classification, a homography-based analytics layer suitable for retrofit deployment, and a fully integrated dashboard unifying control, perception, and monitoring under a single interface.


Key Words: Adaptive Signal Control, Computer Vision, SUMO Microsimulation, Real-Time Traffic Monitoring, YOLOv11

 
TABLE OF CONTENTS
1. Introduction	10
1.1 Background	10
1.2 Problem Statement	10
1.3 Project Objectives	10
1.4 Scope and Limitations	11
1.5 Report Organization	12
2. Literature Review / State of the Art	12
2.1 Adaptive Traffic Signal Control	12
2.2 Computer Vision for Traffic Monitoring	13
2.3 Multi-Object Tracking	14
2.4 Traffic Analytics and Homography-Based Calibration	14
2.5 Real-Time Dashboards and System Integration	14
2.6 Emergency Vehicle Preemption	15
2.7 Gaps Addressed by This Project	15
3. Methodology and Technical Approach	15
3.1 Overall Approach	15
3.2 System Design / Architecture	16
3.2.1 High-Level Architecture	16
3.2.2 Simulation and Control Subsystem	17
3.2.3 Computer Vision Subsystem	19
3.2.4 Backend and Dashboard	20
3.3 Tools, Technologies, and Standards	20
3.4 Data Collection and Analysis	23
3.4.1 Synthetic Dataset Generation	23
3.4.2 Model Training and Evaluation	23
3.4.3 Simulation Experiments	24
4. Implementation	24
4.1 Development Process	24
4.2 Detailed Implementation	25
4.2.1 SUMO Simulation Environment	25
4.2.2 Signal Control Policies	26
4.2.3 Emergency Vehicle Preemption	27
4.2.4 FastAPI Backend and WebSocket Layer	27
4.2.5 CARLA Dataset Generation Pipeline	28
4.2.6 YOLOv11 Training Pipeline	29
4.2.7 ByteTrack Integration	29
4.2.8 Traffic Analytics Layer	29
4.2.9 Next.js Dashboard	31
4.2.10 Computer-Vision Integration into the Live Platform	32
4.2.11 Highway Corridor and Ramp Metering	33
4.2.12 Combined Network and Composite Policy	34
4.2.13 Simulation Lab Page	34
4.3 Department-Specific Contributions	35
4.3.1 Simulation and Control Sub-Team (Alkhozendar, Salamoun, Al-Shobaki)	36
4.3.2 Computer Vision Sub-Team (Al-Labani, Dribika, Jayyusi)	36
4.3.3 Integration Between Sub-Teams	36
4.4 Integration and System Assembly	36
4.5 Challenges and Solutions	37
5. Testing and Validation	38
5.1 Test Plan	38
5.2 Test Results	38
5.3 Performance Evaluation	39
5.4 User Feedback (if applicable)	40
6. Results and Discussion	40
6.1 Final Results	40
6.2 Analysis and Discussion	43
6.3 Comparison with Original Objectives	44
7. Project Management Summary	45
7.1 Work Breakdown and Schedule	45
7.2 Individual Contributions	46
7.3 Inter-Departmental Collaboration Assessment	47
7.4 Budget and Resources	47
8. Ethical, Safety, and Sustainability Considerations	48
8.1 Ethical Considerations	48
8.2 Safety Considerations	49
8.3 Sustainability Considerations	49
9. Conclusions	50
9.1 Summary of Achievements	50
9.2 Lessons Learned	51
9.3 Future Work and Recommendations	52
References	52
APPENDIX A: Source Code and Repository	55
A.1 Repository Links	55
APPENDIX B: User Manual / Installation Guide	56
APPENDIX C: Test Data and Additional Results	58
APPENDIX D: Meeting Minutes and Project Logs	61
D.1 Communication Channels	61
D.2 Recurring Meetings	61
D.3 Key Meetings and Decisions Log	61
D.4 Advisor Feedback Log	63
D.5 Risk Log	63
APPENDIX E: Poster / Presentation Slides	65

 
LIST OF TABLES
Table 1: Tools and Technologies.	21
Table 2: Work-Package Contributions and Effort.	35
Table 3: Individual Contributions.	46
Table 4: Budget and Resources.	47



LIST OF FIGURES
Figure 1. System architecture and component interactions.	17
Figure 2. Actuated signal control policy decision flowchart.	17
Figure 3. Computer vision pipeline stages: capture, training, evaluation, and analytics.	19
Figure 4. Next.js dashboard interface.	20
Figure 5. 3×2 arterial grid network (intersections A0–C1).	26
Figure 6. Actuated leftover-queue policy decision step (step() method).	27
Figure 7. CARLA dataset capture routine (capture_frames()).	28
Figure 8. Ground-point projection from a bounding box (vehicle_ground_point()).	29
Figure 9. Lane-polygon queue counting (point_in_polygon / compute_queue_counts()).	30
Figure 10. Per-vehicle speed estimation (SpeedTracker).	30
Figure 11. Per-lane queue tracking (QueueTracker).	31
Figure 12. Annotated detection and tracking on a highway on-ramp.	31
Figure 13. Highway corridor with ramp metering.	33
Figure 14. Combined city + highway network (collinear merge).	34
Figure 15. Simulation Lab comparison interface.	35
Figure 16. YOLOv11m training and validation metrics across 39 epochs.	40
Figure 17. Normalized confusion matrix across the seven vehicle classes.	41
Figure 18. Precision-recall curve across all classes.	41
Figure 19. Sample detections on held-out validation frames.	42
Figure 20. Network clearance time: actuated vs fixed-time across three demand profiles.	43
Figure 21. Project Gantt chart: planned versus actual timeline.	45
	


LIST OF ABBREVIATIONS
LIST OF ABBREVIATIONS
Abbreviation	Definition
AI	Artificial Intelligence
API	Application Programming Interface
CARLA	Car Learning to Act (open-source autonomous driving simulator)
CCTV	Closed-Circuit Television
COCO	Common Objects in Context (dataset)
CPU	Central Processing Unit
CSS	Cascading Style Sheets
CV	Computer Vision
DB	Database
ERD	Entity-Relationship Diagram
FastAPI	Fast Asynchronous Python Interface (web framework)
FPS	Frames Per Second
GPU	Graphics Processing Unit
HLS	HTTP Live Streaming
HTML	HyperText Markup Language
ID	Identifier
IDF1	Identification F1 Score (tracking metric)
imgsz	Image Size
IP	Intellectual Property
JSON	JavaScript Object Notation
km/h	Kilometers per Hour
L40S	NVIDIA L40S GPU
LLM	Large Language Model
mAP	Mean Average Precision
mAP50	Mean Average Precision at IoU threshold 0.50
mAP50-95	Mean Average Precision averaged over IoU thresholds 0.50 to 0.95
MIT	Massachusetts Institute of Technology (license type)
MOTA	Multiple Object Tracking Accuracy
OOM	Out of Memory
OS	Operating System
PCB	Printed Circuit Board
PNG	Portable Network Graphics
QA	Quality Assurance
RAM	Random-Access Memory
REST	Representational State Transfer
RTX	NVIDIA Ray Tracing eXtreme (GPU series)
SORT	Simple Online and Realtime Tracking
SUMO	Simulation of Urban MObility
TLS	Traffic Light System
TraCI	Traffic Control Interface (SUMO API)
UI	User Interface
USD	United States Dollar
UUID	Universally Unique Identifier
VRAM	Video Random-Access Memory
WBS	Work Breakdown Structure
WP	Work Package
WS	WebSocket
WSL	Windows Subsystem for Linux
XML	Extensible Markup Language
YAML	YAML Ain't Markup Language
YOLO	You Only Look Once (object detection family)
YOLOE	YOLO with open-vocabulary prompting
YOLOS	YOLO based on Transformer architecture
YOLOv11	YOLO version 11
YOLOv12	YOLO version 12

 
1. Introduction
1.1 Background
Urban mobility is one of the defining infrastructure challenges of the twenty-first century. As cities grow denser and vehicle volumes rise, road networks designed for earlier traffic conditions are increasingly unable to absorb peak demand without significant delay and congestion. Traffic signal control sits at the heart of this problem: it is the primary lever through which cities regulate intersection throughput, and its performance has a measurable cascading effect on network-wide travel time, emissions, fuel consumption, and emergency response capability.
Traditional signal control operates on fixed timing plans derived from historical traffic surveys — an approach that is predictable but inherently blind to real-time conditions. When actual demand deviates from the assumed pattern, as it routinely does during incidents, events, or seasonal variation, fixed-time plans cannot adapt. The result is wasted green time at empty approaches and queues that cannot clear at congested ones.
Advances in artificial intelligence, computer vision, and embedded computing have created the technical conditions for a fundamentally different approach. Machine-learning-based vehicle detection now runs at real-time rates on consumer-grade hardware. Microsimulation platforms provide controllable, reproducible environments for evaluating control policies before deployment. And web-based dashboards make it possible to expose system state, operator controls, and performance metrics through a single unified interface accessible without specialist infrastructure.
This project sits at the intersection of these developments, applying AI-based computer vision and adaptive signal control within a simulation-grounded architecture that is designed to be reproducible, deployable on commodity hardware, and measurable against a quantitative baseline.
1.2 Problem Statement
Fixed-time traffic signal control is unable to respond to fluctuating demand, leading to preventable congestion, increased journey times, and degraded emergency vehicle access at urban intersections. The problem is compounded by the difficulty of obtaining reliable real-time traffic data: most intersections lack instrumented sensing, and where cameras exist, the processing pipelines required to extract actionable metrics — queue lengths, vehicle speeds, violation events — are typically not deployed.
The consequence is a gap between what is observable in real time and what signal controllers actually use. Even when adaptive systems exist, they often rely on inductive loop detectors that require costly road-surface installation and provide limited classification capability. The absence of fine-grained vehicle classification means that emergency vehicles cannot be reliably identified and prioritized in real time, and traffic violation monitoring depends on dedicated, separately operated systems.
This project addresses these limitations by building a system that combines adaptive signal control with a camera-based perception pipeline capable of detecting, tracking, and classifying vehicles in real time — including emergency vehicles — and feeding those measurements directly into the control loop. The system targets urban traffic engineers and smart-city operators who need a cost-effective, hardware-agnostic alternative to loop-detector-based adaptive control, deployable using existing camera infrastructure.
1.3 Project Objectives
The overarching goal of the project is to design, implement, and evaluate an AI-based adaptive traffic management system that measurably improves intersection throughput relative to fixed-time control, while providing real-time monitoring, emergency vehicle prioritization, and traffic analytics through a unified web interface.
The specific objectives of the completed system are as follows:
1.	Build a SUMO-based microsimulation environment modeling a 3×2 arterial grid of six intersections, with configurable demand profiles and vehicle behaviors.
2.	Develop an adaptive traffic signal control policy that dynamically adjusts green time based on real-time per-lane queue measurements derived from simulation state.
3.	Implement an emergency vehicle preemption module supporting manual dispatch and signal corridor clearing through the dashboard.
4.	Develop a computer vision pipeline using a custom-trained YOLOv11 model to detect, track, and classify vehicles across seven classes — including emergency vehicles — from simulated camera feeds.
5.	Build a traffic analytics layer providing lane-level speed estimation, per-lane queue counting, red-light and chevron violation detection, highway entry counting, and collision detection.
6.	Integrate all components into a unified system with a real-time web dashboard supporting live monitoring, policy tuning, emergency dispatch, and an embedded AI assistant.
7.	Compare the adaptive policy against a fixed-time baseline through reproducible race-mode experiments across three demand profiles.
8.	Log simulation and analytics data to a persistent Supabase database for post-hoc analysis and experiment archiving.
9.	Evaluate system performance using measurable metrics including detection accuracy, tracking quality, throughput improvement, and inference speed.
10.	Implement a ramp-metering controller for highway on-ramps using the ALINEA closed-loop occupancy-feedback law, alongside a binary speed-threshold baseline, and evaluate both against an always-green control on a 3 km freeway corridor with four metered ramps.
11.	Extend the simulation to a combined city+highway network in which a freeway corridor feeds directly into the 3×2 arterial grid through colinear feeder edges, and support running an arterial actuated controller and a ramp ALINEA controller in tandem on this network through a composite policy abstraction.
12.	Build a dedicated Simulation Lab page that consolidates comparison authoring, side-by-side result charts, percentage-improvement reporting against a baseline run, and a click-to-drill-down per-run detail view, with all comparison history retained for revisitation.
Relative to the original proposal, two methodological changes were introduced during execution. Off-the-shelf pre-trained models were replaced with a custom-trained YOLOv11 model after testing revealed they could not reliably distinguish emergency from non-emergency vehicles. Correspondingly, the training data source was changed from real-world footage to a CARLA-generated synthetic dataset, which afforded full control over class distribution, weather conditions, and camera placement. Both changes strengthened the final system without altering any core objective.
1.4 Scope and Limitations
The project scope encompasses the full pipeline from traffic simulation and signal control through vehicle detection, tracking, and analytics, to real-time dashboard visualization and persistent data logging. Three reference networks are supported — an arterial 3×2 grid, a highway corridor with ramp meters, and a combined city+highway corridor — together with the four signal controllers required to manage them: a fixed-time baseline, an actuated leftover-queue arterial controller, a binary speed-threshold ramp meter, and a closed-loop ALINEA ramp meter. A composite policy abstraction allows arterial and ramp controllers to run simultaneously on the combined network. All components have been implemented, integrated, and validated.
The following are explicitly outside the scope of the project: deployment on physical road infrastructure or live municipal camera feeds; hardware procurement or installation of any sensing equipment; multi-intersection coordination through vehicle-to-infrastructure communication protocols; and integration with third-party traffic management platforms or municipal control centers.
Several technical limitations apply. The computer vision pipeline is validated on CARLA-generated synthetic data and on simulated camera feeds; real-world deployment would require domain adaptation to account for lighting variation, camera distortion, and occlusion patterns not fully represented in synthetic training data. Three SUMO networks are implemented and evaluated: a 3×2 arterial grid (six signalized intersections), a 3 km highway corridor with four ramp meters, and a combined network in which the freeway feeds into the arterial grid through colinear feeder edges. Performance characteristics on networks larger than the combined corridor, or with topologies materially different from these three reference layouts (for example, irregular grids or networks with grade separation), have not been quantified and may differ. The ByteTrack tracker loses identity through extended occlusions, a known limitation of single-camera tracking that would require multi-camera fusion to fully address. The B0 and B1 intersections exhibit a structural geometry chokepoint that the adaptive policy cannot fully resolve through timing adjustments alone.
Regarding constraints: the system was developed entirely on open-source and free-tier tools with a direct expenditure of approximately $2.50 USD for cloud GPU training time, demonstrating economic deployability. No environmental or health-and-safety concerns apply to a software-only simulation system. Ethical considerations were limited to the use of synthetic data — no real individuals were recorded or identified. Social and sustainability considerations are embedded in the project's motivation: reducing unnecessary idling and improving emergency response access both carry positive externalities for urban communities.
1.5 Report Organization
The remainder of this report is organized as follows. Section 2 reviews the state of the art in adaptive signal control, computer vision for traffic monitoring, multi-object tracking, traffic analytics, and system integration. Section 3 presents the methodology and system architecture for both subsystems, the technology stack, and the data collection and analysis approach. Section 4 details the implementation of each component and the integration between the two subsystems. Section 5 describes the testing and validation plan and its results. Section 6 reports the final results and discusses them against the project objectives. Section 7 summarizes project management, including the work breakdown, individual contributions, inter-departmental collaboration, and budget. Section 8 addresses ethical, safety, and sustainability considerations. Section 9 concludes the report with a summary of achievements, lessons learned, and future work.
2. Literature Review / State of the Art
2.1 Adaptive Traffic Signal Control
Traffic signal control has been an active research area for decades, evolving from simple fixed-time plans to increasingly sophisticated adaptive strategies. Fixed-time control, in which signal phases follow pre-computed schedules derived from historical demand surveys, remains the dominant deployed approach due to its simplicity and predictability. However, it is fundamentally unable to respond to real-time demand fluctuations, leading to wasted green time at underloaded approaches and persistent queue buildup at congested ones during off-nominal conditions.
Actuated control addressed this limitation by introducing detector-triggered phase extensions, allowing green time to stretch when vehicles are still present and to cut short when an approach empties. Webster's foundational work established the theoretical basis for optimal fixed-cycle signal timing [19], and subsequent work by Koonce et al. formalized actuated control as an industry standard in the United States [20]. However, classical actuated systems rely on inductive loop detectors embedded in road surfaces, which require costly installation, periodic maintenance, and provide no vehicle classification capability.
More recent approaches apply reinforcement learning to signal control, treating each intersection as an agent that learns a timing policy through interaction with a simulated traffic environment. Genders and Rahimi demonstrated that deep Q-network agents trained in SUMO could outperform fixed-time and actuated baselines on simulated arterial networks [21], and subsequent work has extended this to multi-agent settings covering entire networks [22]. While promising, reinforcement learning approaches introduce training complexity, hyperparameter sensitivity, and limited interpretability — concerns that motivated the present project's choice of an explicitly designed actuated policy with tunable parameters rather than a learned one.
SUMO (Simulation of Urban MObility) is the standard open-source platform for microsimulation-based traffic research [1]. Its TraCI Python API enables closed-loop control experiments in which an external program reads simulation state and writes signal commands at every tick, making it well-suited to policy development and reproducible comparative evaluation. The present project uses SUMO with TraCI as the core simulation engine, extending it with a subscription-driven state extraction layer and a race-mode experiment framework for reproducible policy comparison.
2.2 Computer Vision for Traffic Monitoring
Camera-based traffic monitoring has attracted substantial research attention as an alternative to loop detectors, motivated by the lower installation cost and richer information content of video feeds. Early approaches applied classical image processing — background subtraction, optical flow, and blob detection — to vehicle counting and speed estimation. While effective under controlled conditions, these methods degrade rapidly with illumination changes, occlusion, and camera perspective variation.
The introduction of convolutional neural network-based object detectors transformed the field. Redmon et al. proposed the YOLO (You Only Look Once) family of detectors, which reframe object detection as a single regression problem over a grid of spatial anchors, enabling real-time inference rates without sacrificing accuracy [4]. Subsequent versions of YOLO have progressively improved the speed-accuracy tradeoff; YOLOv11, the architecture used in this project, achieves state-of-the-art accuracy on the COCO benchmark [10] while running at real-time rates on consumer-grade GPU hardware [3].
A practical challenge in traffic camera deployment is the domain gap between training data and deployment conditions. Models trained on generic datasets such as COCO detect common vehicle categories reliably but lack the fine-grained class distinctions required for traffic management — particularly the ability to distinguish emergency vehicles from regular traffic. This limitation was confirmed during the project's pre-trained model evaluation phase, where YOLOE [23] and VideoMT, despite strong general-purpose performance, could not reliably classify police cars separately from passenger vehicles. The solution adopted — training a custom YOLOv11 model on a purpose-built synthetic dataset — is consistent with findings in the literature that domain-specific training data is the primary driver of minority-class recall [24].
Synthetic data generation using driving simulators has emerged as a cost-effective alternative to manual annotation of real-world footage, particularly for rare or safety-critical scenarios. CARLA, an open-source urban driving simulator built on Unreal Engine, provides high-fidelity rendering, controllable weather and lighting, and a Python API for synchronous sensor simulation [2]. Several studies have demonstrated that models trained on CARLA-generated data transfer to real-world footage with appropriate domain randomization [25], supporting the project's use of CARLA as the sole training data source. The project's dataset pipeline cycles through thirteen weather presets and multiple camera placements per scenario, implementing a form of domain randomization to improve transfer robustness.
2.3 Multi-Object Tracking
Reliable vehicle tracking requires maintaining consistent identities across frames as vehicles enter, exit, and temporarily occlude one another. The canonical formulation is tracking-by-detection, in which a detector produces per-frame bounding boxes and a tracker associates them across frames using motion models and appearance features.
SORT (Simple Online and Realtime Tracking) established a lightweight baseline using Kalman filtering for motion prediction and the Hungarian algorithm for association [7]. DeepSORT extended this with appearance embeddings extracted by a re-identification network, improving identity consistency through long occlusions at the cost of additional inference overhead [6]. ByteTrack departed from the appearance-feature paradigm by demonstrating that associating every detection box — including low-confidence ones — using IoU-based matching in a two-stage cascade achieves competitive or superior tracking accuracy without any appearance model [5]. This appearance-free property makes ByteTrack robust to lighting variation and cross-class confusion, and its native integration within the Ultralytics framework made it the natural choice for this project. Tracking performance is evaluated using the CLEAR MOT metrics — MOTA and MOTP — proposed by Bernardin and Stiefelhagen [15], and the IDF1 metric introduced by Ristani et al. [16].
2.4 Traffic Analytics and Homography-Based Calibration
Extracting real-world metrics — vehicle speed, queue length, headway — from a monocular camera requires a geometric transformation between the image plane and the ground plane. The standard approach is homography estimation from a set of ground control points whose real-world coordinates are known, as formalized in Hartley and Zisserman's comprehensive treatment of multi-view geometry [14]. A 4-point homography is sufficient for flat road surfaces and is well-suited to retrofit deployment on existing traffic cameras without requiring specialized calibration targets or intrinsic parameter estimation.
Speed estimation by applying a homography to tracked centroid trajectories has been validated in several traffic monitoring studies, with per-vehicle speed errors below 5 km/h achievable under favorable conditions [26]. Queue length estimation from video typically combines speed thresholding with spatial zone definitions — a vehicle is counted as queued if it falls within a defined lane polygon and its speed falls below a threshold for a sustained period. The project implements both approaches, using a 5-frame rolling average for speed smoothing and a configurable speed threshold (default 3 m/s over 2 seconds) for queue classification.
2.5 Real-Time Dashboards and System Integration
The integration of traffic sensing, control, and visualization into a unified operational platform is a recognized systems challenge. Commercially deployed platforms such as SCOOT and SCATS combine detector inputs, adaptive signal control, and operator interfaces, but they rely on proprietary hardware and are not accessible for research or small-scale deployment [27]. Open-source alternatives remain scarce and typically expose only one layer of the stack.
Web-based real-time dashboards built on modern JavaScript frameworks have become the standard approach for operational visualization in research systems. The combination of a FastAPI backend [12] with WebSocket broadcasting and a Next.js frontend [13] provides a well-supported, low-latency stack for streaming per-tick simulation state to connected clients. State management via Zustand ensures that dashboard components re-render efficiently as new data arrives without prop-drilling or unnecessary reconciliation. The embedded Groq-powered AI assistant [18] extends the dashboard with a natural-language querying interface, a pattern that has been applied in several recent smart-city monitoring systems to lower the operator skill barrier. Persistent logging to Supabase [17] enables post-hoc experiment analysis and reproducible result archiving, consistent with open-science practices in traffic simulation research.
2.6 Emergency Vehicle Preemption
Emergency vehicle preemption — the temporary override of normal signal operation to provide a green corridor for approaching emergency vehicles — is a well-established operational capability in high-traffic urban networks. Conventional preemption systems rely on optical or radio emitters mounted on emergency vehicles and receivers at intersections, requiring dedicated hardware. Research in camera-based emergency vehicle detection has demonstrated that visual classification combined with acoustic detection can achieve comparable detection rates without vehicle-mounted equipment [28], supporting the project's approach of dashboard-triggered preemption based on the computer vision pipeline's emergency vehicle class output.
2.7 Gaps Addressed by This Project
The reviewed literature reveals three gaps that this project directly addresses. First, while adaptive signal control and computer vision for traffic monitoring have each been studied extensively, systems that close the feedback loop between camera-derived measurements and signal control decisions in real time remain rare, and published implementations are typically not deployable on commodity hardware. Second, fine-grained emergency vehicle classification in traffic camera footage has received limited attention relative to general vehicle detection, leaving a gap in operationally relevant perception capability. Third, reproducible, openly documented comparative evaluation frameworks for adaptive signal control policies — including race-mode experiment infrastructure and public result archiving — are largely absent from the literature, making it difficult to compare results across studies. This project contributes implementations addressing all three gaps within a single integrated system.
3. Methodology and Technical Approach
3.1 Overall Approach
The project followed an iterative, subsystem-parallel development methodology in which the simulation and control team and the computer vision team worked concurrently along clearly defined ownership boundaries, converging at scheduled integration milestones. This structure allowed both subsystems to reach maturity independently before being coupled, reducing the risk that delays in one area would block progress in the other.
Development proceeded in three broad phases. The first phase, running through January 2026, focused on foundation building: establishing the SUMO simulation environment, implementing the TraCI control interface, developing the actuated and fixed-time signal policies, and standing up the FastAPI backend and WebSocket broadcasting layer. On the computer vision side, this phase covered the evaluation of off-the-shelf pre-trained models and the decision to pivot to a custom-trained architecture.
The second phase, running through April 2026, focused on pipeline completion: building the CARLA synthetic dataset generation pipeline, training and evaluating the YOLOv11 model, integrating ByteTrack tracking, constructing the Next.js dashboard, and adding the emergency vehicle preemption module and CARLA visualization bridge. The comparative evaluation framework was also established during this phase, with the first set of race-mode experiments executed.
The third phase, covering May and June 2026, focused on integration and finalization: wiring the computer vision pipeline into the live simulation tick loop, completing the traffic analytics layer including speed estimation, queue counting, red-light and chevron violation detection, highway entry counting, and collision detection, finalizing Supabase data logging, polishing the experiment comparison interface, and preparing the demonstration environment.
Throughout all phases, the team applied several consistent engineering practices. Interface contracts between subsystems were documented in a shared API specification before implementation began on either side, preventing type drift between the Python backend and TypeScript frontend. A co-commit convention required that any change to a Pydantic model be accompanied by the corresponding TypeScript update in the same pull request. New features were implemented as optional or additive extensions behind feature flags rather than modifications to existing behavior, reducing regression risk. Automated dataset analysis scripts ran after every CARLA capture session to flag class imbalances before they propagated into training runs.
Reproducibility was treated as a first-class design requirement throughout. The race-mode experiment framework ensures that each policy comparison run starts from an identical network state, uses the same random seed, and logs all parameters and results to Supabase, making results independently verifiable.
3.2 System Design / Architecture
3.2.1 High-Level Architecture
The system is organized into four cooperating layers connected through a real-time data flow: the simulation engines, the FastAPI backend, the Next.js dashboard, and the computer vision pipeline. Figure 1 illustrates the interactions between these layers and the data paths connecting them.

At the foundation, the simulation engine — either SUMO or CARLA, hot-swappable behind a common interface — produces raw vehicle positions, speeds, signal states, and queue measurements on every simulation tick. The FastAPI backend extracts this state into a structured TickData snapshot through a subscription-driven TraCI client, applies the active signal control policy, pushes the resulting phase commands back to the simulation, logs the snapshot to Supabase, and broadcasts it over WebSocket to all connected dashboard clients. The Next.js dashboard consumes TickData frames through a useWebSocket hook, updates the Zustand state store, and renders the live network map, intersection detail panels, metrics history charts, policy tuning interface, emergency dispatch controls, and embedded AI assistant. In the fully integrated system the computer vision pipeline runs as an independent per-camera analyzer alongside the simulation state stream. For the single intersection whose camera is currently being viewed, the analyzer's per-lane queue counts and any detected emergency vehicles override the corresponding fields of that intersection's TickData record before broadcast, allowing the actuated policy to operate on perception-derived measurements for the watched intersection while every other intersection in the network continues to use simulator ground truth. Richer per-frame analytics outputs — per-track positions, smoothed speeds, lane-level violation events, highway entry counts, and collision detections — are written by the analyzer to per-session CSV and JSON log files for post-hoc inspection rather than streamed inline in TickData, keeping the broadcast schema compact and policy-focused.
Figure 1. System architecture and component interactions.

3.2.2 Simulation and Control Subsystem
The simulation environment models a 3×2 arterial road network of six intersections, labeled A0, A1, B0, B1, C0, and C1, with three configurable demand profiles: balanced, asymmetric, and extreme. Vehicle routes and counts are regenerated from the selected demand profile before each simulation run, ensuring that policy comparison experiments begin from reproducible initial conditions.

The actuated signal control policy implements a leftover-queue redistribution scheme over the standard 4-phase split-phase plan (N → E → S → W). At each tick, the TraCI client extracts per-lane queue lengths via subscriptions, avoiding repeated per-vehicle polling. At the end of every full signal cycle, the policy records the unserved queue remaining on each direction, smooths it across cycles with an exponential moving average, and redistributes green time on the next cycle from over-supplied directions toward the most under-supplied one — subject to per-direction minimum and maximum green time bounds. Eight policy parameters are exposed through the dashboard's policy tuning panel and persisted as named variants to disk: per-direction base green times (base_green_n, base_green_s, base_green_e, base_green_w, default 15 s for N/S and 35 s for E/W); the per-direction green floor and ceiling (min_green, max_green, defaulting to 10 s and 50 s); the maximum amount of green time that may be moved between directions in a single cycle (max_redist_s, default 12 s); and the EMA smoothing weight on the inter-cycle leftover signal (smooth_alpha, default 0.7). The fixed-time baseline uses the same 4-phase plan with static durations independent of measured queue state and shares the same controller interface, enabling direct substitution for comparative experiments.
Figure 2. Actuated signal control policy decision flowchart.

The highway corridor network models a 3 km dual-carriageway freeway crossed by a parallel service road, with four signalized on-ramp meters (E1 and E2 eastbound, W1 and W2 westbound) that throttle the rate at which service-road vehicles merge into mainline traffic. Two ramp-metering controllers are implemented against this network. The binary controller samples a six-second rolling mean of downstream-lane speed and switches between a free-flow mode (long green, brief red) when downstream speed exceeds 60 km/h and a metered mode (short green, ten-second red) when it falls below, with a service-road queue threshold that overrides into free flow whenever the ramp queue would otherwise spill back. The ALINEA controller implements the standard closed-loop occupancy-feedback law r(k) = clamp(r(k−1) + K·(o_target − o_measured(k)), r_min, r_max), where r(k) is the metering rate in vehicles per hour at control interval k, o_measured is the average lane occupancy sampled on the freeway segment immediately downstream of the meter, and o_target is the critical occupancy at the capacity knee (default 20 %). Eight tunable parameters — target_occupancy_pct, gain_K, r_min_vph, r_max_vph, control_interval_s, queue_max_veh, green_s, and yellow_s — are exposed as fields of an AlineaPolicyParams Pydantic model and persisted alongside arterial variants in the Supabase policy_variants table, distinguished by a family column (arterial or highway).
The combined network composes the arterial grid and the highway corridor into a single SUMO model. The freeway runs collinearly with the grid's row 0 and row 1 axes — the eastbound carriageway shares the y-coordinate of row 1 and the westbound carriageway shares the y-coordinate of row 0 — so that each direction's exit feeds straight into the corresponding arterial row through a short three-lane feeder edge, with no diagonal junction. Because this network carries both arterial intersections and ramp meters simultaneously, a CompositePolicy is introduced: it accepts an arterial controller and a ramp controller as children and concatenates their per-tick SignalCommand lists, allowing any combination of {fixed-time, actuated} × {fixed-time, binary, ALINEA} to run side by side without modification to either child controller. Each child ignores intersections that fall outside its remit, so the composition is safe by construction. The dashboard exposes this through two independent policy pickers — one for the arterial half, one for the ramp half — that materialize only when the combined network is selected.
Emergency vehicle preemption is implemented as a priority path that overrides the actuated policy when an emergency vehicle is dispatched through the dashboard. The preemption module identifies the vehicle's current position and target intersection, computes the sequence of phases required to clear a green corridor, and injects those overrides into the tick loop until the vehicle clears the intersection.
The CARLA bridge connects to a running CARLA instance and synchronizes vehicle positions and signal states from SUMO into the CARLA world using an empirically derived coordinate transformation (CARLA x = SUMO x − 109.34, CARLA y = 135.96 − SUMO y, CARLA yaw = SUMO yaw − 90°). The bridge is optional and degrades gracefully when CARLA is unavailable, reporting connected: false without affecting the SUMO simulation or dashboard.
3.2.3 Computer Vision Subsystem
The computer vision pipeline is organized around four sequential stages — capture, training, evaluation, and analytics — as illustrated in Figure 3.
 
Figure 3. Computer vision pipeline stages: capture, training, evaluation, and analytics.

The capture stage connects to a CARLA simulator instance, spawns vehicles from configurable scenario YAML files covering seven classes (car, ambulance, bus, truck, police car, fire truck, and bike), and records synchronous sensor output with ground-truth 3D-to-2D bounding box label projection. The pipeline supports up to four simultaneous cameras, cycles through thirteen weather presets per scenario, and runs in batch mode across multiple maps. Spawn ratios are tuned to address class imbalance for rare categories, with police car and bus counts doubled relative to their natural occurrence.
The training stage wraps the Ultralytics YOLO API to fine-tune YOLOv11m on the captured dataset. Final training was performed on a rented NVIDIA L40S 48GB GPU via vast.ai over 39 epochs, completing in approximately three hours. Training configuration includes image size 640, batch size 64, and PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True to prevent VRAM fragmentation.
The evaluation stage runs the trained model with ByteTrack on held-out test recordings and computes both detection metrics (precision, recall, mAP50, mAP50-95, per-class confusion matrix) and tracking metrics (MOTA, IDF1, ID switches) using the CLEAR MOT and IDF1 formulations.
The analytics stage performs camera calibration via 4-point homography using an interactive ground control point picker. Speed is computed per tracked vehicle by applying the homography to a reference point on the bounding box, smoothed over a 5-frame rolling window. Per-lane queue counts are derived from interactively defined lane polygons, with a vehicle classified as queued if its estimated speed falls below 3 m/s for at least 2 seconds. Red-light violation detection flags vehicles whose ground reference point crosses a defined stop line while the controlling signal is red. Chevron violation detection flags vehicles that drive into a defined no-go zone — the painted chevron or gore area at a highway ramp, represented as a forbidden polygon — by testing whether each tracked vehicle’s ground point falls inside the zone; no traffic-light state is required, and each vehicle is flagged once. Highway entry counting tallies vehicles entering tagged entry zones. Collision detection identifies vehicles whose bounding boxes and ground-plane positions indicate an impact event within a configurable proximity threshold.
3.2.4 Backend and Dashboard
The FastAPI backend exposes RESTful endpoints for simulation control (start, stop, reset), policy configuration (load, save, list variants), experiment management (initiate race mode, retrieve results), and emergency vehicle dispatch. The WebSocket broadcasting layer pushes TickData snapshots to all connected clients at the simulation tick rate, decoupled from the HTTP layer to avoid blocking the simulation loop.
The Supabase Postgres persistence layer is organized around three tables that together capture the full lifecycle of a run. The simulation_runs table stores one row per simulation start, holding the run's UUID, start and end timestamps, network identifier, demand profile, vehicle count, random seed, policy type, and the full JSONB configuration blob (including the policy_params object); per-tick metric snapshots are stored as an array of compact records on the same row. The policy_variants table stores named policy parameter sets — one row per variant — with a family discriminator column (arterial or highway) that separates ActuatedPolicyParams rows from AlineaPolicyParams rows, and the same JSONB policy_params shape used by simulation_runs to enable JSONB containment queries (config @> {policy_params: …}) for variant performance look-up. The experiment_records table stores one row per comparison run, with a foreign key to each of the constituent simulation_runs and a JSONB outcome blob carrying the side-by-side metric summary surfaced in the Simulation Lab page. All three tables are written via the Supabase Python client through a buffered bulk-insert path, with a ten-item in-memory queue and an asynchronous flush task that decouples database latency from the tick loop.
The Next.js dashboard renders a live network map showing all six intersections with real-time signal phase indicators and vehicle density overlays. Intersection detail panels display per-lane queue lengths, speed distributions, and phase countdown timers. The metrics history view plots clearance time, throughput, and average speed over the course of a run. The experiment comparison interface presents side-by-side results from race-mode runs across all demand profiles. The policy tuning panel exposes the eight actuated policy parameters with named variant saving. The emergency dispatch panel supports manual vehicle injection and live preemption status. The embedded Groq-powered AI assistant allows operators to query simulation state in natural language, with the current TickData snapshot injected into the prompt context.
 
Figure 4. Next.js dashboard interface.

3.3 Tools, Technologies, and Standards
The complete technology stack is summarized in Table 1 of the report. The key choices and their rationale are described below.
SUMO 1.26.0 was selected as the primary simulation engine for its maturity, open-source license, TraCI Python API, and widespread use in traffic signal control research, which ensures that results are comparable to the existing literature. CARLA 0.9.16 was added as an optional visualization and sensor simulation backend; its Unreal Engine rendering provides sufficient photorealism for synthetic training data generation, and its Python API supports synchronous camera sensor operation required for frame-accurate label projection.
YOLOv11m was selected over alternative architectures based on its superior speed-accuracy tradeoff on the COCO benchmark at the time of model selection, and its native integration within the Ultralytics framework, which provides a unified API for training, evaluation, export, and tracker integration. ByteTrack was selected over DeepSORT for its appearance-free design, which removes the dependency on a re-identification network and makes the tracker robust to the visual variation introduced by synthetic-to-real domain shift.
FastAPI was selected for the backend for its native async support, automatic OpenAPI documentation generation, and Pydantic-based request and response validation, which enforces the shared type contract between backend and frontend. Next.js 14 with React 18 and Tailwind CSS was selected for the dashboard for its server-side rendering capability, mature WebSocket client support, and the availability of the Zustand state management library, which provides lightweight reactive state without the boilerplate of Redux.
PyTorch 2.x with CUDA was used as the deep learning framework, consistent with the Ultralytics ecosystem. OpenCV handled all frame I/O, homography computation, and visualization. NumPy and Matplotlib supported numerical computation and result plotting throughout the project.
Roboflow was used for annotation management and augmentation during the real-world dataset construction phase, before the pivot to CARLA synthetic data. The YOLO label format was used throughout for detection annotations, extended with an actor ID column for tracking ground truth. Supabase (Postgres) provided the persistent storage layer on its free tier, with the database schema designed to accommodate tick-level logging at the simulation's default tick rate without exceeding free-tier storage limits during evaluation runs.
All software components use open-source or free-tier licenses. The only direct monetary expenditure was approximately $2.50 USD for cloud GPU rental for the final training run.

Table 1: Tools and Technologies.
Category	Tool / Technology	Status
Simulation & Control		
Traffic simulation	SUMO 1.26.0 (TraCI Python API)	✅ As proposed
3D simulation	CARLA 0.9.16 (optional visualization bridge)	➕ Added
Signal control	Actuated (leftover-queue) + fixed-time policies	✅ As proposed
Policy persistence	Filesystem (artifacts/policy_variants/)	➕ Added
Backend & Data		
Backend framework	FastAPI + Uvicorn + WebSocket	✅ As proposed
Database	Supabase (Postgres)	✅ As proposed
Backend language	Python 3.9+	✅ As proposed
Frontend		
Frontend framework	Next.js 14 + React 18 + Tailwind CSS	✅ As proposed
State management	Zustand	✅ As proposed
Frontend language	TypeScript	✅ As proposed
AI assistant	Groq API (LLM chatbot in dashboard)	➕ Added
Computer Vision		
Detection framework	Ultralytics YOLO 8.4 (YOLOv11 architecture)	⚙️ Changed from YOLOS
Multi-object tracking	ByteTrack (integrated via Ultralytics)	⚙️ Changed from SORT/DeepSORT
Deep learning framework	PyTorch 2.x (with CUDA)	✅ As proposed
Image processing	OpenCV (frame I/O, drawing, homography, video output)	✅ As proposed
Numerical computing	NumPy, Matplotlib, PyYAML	✅ As proposed
Dataset annotation	Roboflow (annotation, augmentation, YOLO export)	➕ Added
Live-stream ingest	yt-dlp + ffmpeg (HLS feeds, real-data attempt)	➕ Added
Analytics pipeline	Custom homography-based ground-plane calibration	➕ Added
Compute & Infrastructure		
Cloud GPU (final training)	vast.ai (NVIDIA L40S 48GB)	➕ Added
Cloud GPU (preliminary)	Google Colab (NVIDIA A100)	➕ Added
Local hardware	NVIDIA RTX 4060 Laptop GPU	✅ As proposed
Development & Tooling		
Version control	Git / GitHub	✅ As proposed
Package management	pip (backend) + npm (frontend)	✅ As proposed
Linting	Ruff (line-length 100)	✅ As proposed
OS / environment	Windows 11 + WSL Ubuntu, Python 3.11 (conda)	✅ As proposed
Standards		
Detection labels	YOLO label format	✅ As proposed
Tracking labels	Extended YOLO format (adds actor_id column)	➕ Added
Analytics output	Ground-plane coordinate system (meters)	➕ Added
3.4 Data Collection and Analysis
3.4.1 Synthetic Dataset Generation
The primary training dataset was generated using the CARLA simulator. A scenario configuration system defined vehicle spawn ratios, camera placements, and weather presets through YAML files, enabling reproducible batch capture across multiple CARLA maps. The capture pipeline operated in synchronous mode, advancing the simulation one tick at a time and reading camera sensor output at each frame to ensure frame-accurate label correspondence. Ground-truth bounding boxes were computed by projecting 3D actor bounding volumes into the camera image plane using CARLA's built-in transform API, with a minimum visibility threshold of 0.15 to include partially occluded vehicles.
The dataset comprises 12,064 labeled images across seven vehicle classes: car, ambulance, bus, truck, police car, fire truck, and bike (motorcycles and bicycles). Spawn ratios were tuned iteratively based on automated class distribution analysis after each capture session, with rare classes (police car, bus, bicycle) spawned at two to three times their natural occurrence rate to address the class imbalance that caused poor minority-class recall in early training runs. The final dataset spans thirteen weather presets per scenario across multiple CARLA maps, providing lighting and environmental diversity without requiring real-world footage.
3.4.2 Model Training and Evaluation
Two preliminary models were trained on a real-world dataset assembled from public sources and annotated via Roboflow. Although these models achieved test mAP50 of 0.931, deployment on live municipal traffic feeds revealed substantial failures due to domain mismatch and class imbalance in the scraped imagery, confirming the decision to pivot to synthetic data.
The final YOLOv11m model was trained on the CARLA-generated dataset for 39 epochs on an NVIDIA L40S GPU. The training configuration used image size 640, batch size 64, and automatic mixed precision. Model performance was evaluated on a held-out 4,979-frame CARLA recording not used during training, yielding mAP50 = 0.949, mAP50-95 = 0.865, precision = 0.970, and recall = 0.900. Per-class evaluation confirmed strong performance across all seven categories, with bus recall recovering from 7.9% in the imbalanced dataset to 96% after spawn ratio correction.
Tracking performance was evaluated on the same held-out recording using CLEAR MOT metrics, yielding MOTA = 0.78 and IDF1 = 0.88 with 47 ID switches across 47,014 detections. ID switches were concentrated at expected failure modes — extended occlusions by larger vehicles and re-entries after frame boundary exits — and are documented as a known limitation of single-camera tracking.
3.4.3 Simulation Experiments
Comparative evaluation was conducted using a race-mode experiment framework in which the actuated policy and the fixed-time baseline run from identical initial conditions on the same SUMO network. Six experiments were executed across three demand profiles (balanced, asymmetric, extreme), with network clearance time — the elapsed simulation time from the start of the run until no vehicles remain in the network — as the primary performance metric. The actuated policy reduced clearance time by 40–54% across all three profiles. A persistent chokepoint at intersections B0 and B1 was identified from per-intersection queue time-series data and is attributed to the structural geometry of those intersections rather than policy parameters; it is documented as a network-level constraint and partially mitigated through per-intersection maximum green time bias exposed in the policy tuning panel.
A second class of experiment evaluates ramp metering on the combined network. With the freeway exit feeding into a 3-signal cascade through the arterial grid (rows 1 or 0 depending on direction of travel), downstream city capacity becomes the binding constraint on the freeway — a regime in which ramp metering's value proposition (smoothing mainline occupancy by holding cars on the ramp) is meaningful. A 4,000-vehicle race-mode comparison between an always-open meter and ALINEA (target occupancy 15 %, tuned down from the 20 % default to push the controller into a more active regime for the experiment, gain 150) was executed on this network with all other settings held fixed. ALINEA reduced mean mainline trip time by 1.0 % and 90th-percentile trip time by 1.9 %, with maximum measured bottleneck occupancy falling from 32.7 % to 31.9 %. As expected, ramp-merge trip time rose by 1.0 % — the cars held on the ramp pay for the mainline improvement — and the maximum ramp queue stabilized at 21 vehicles, below the queue_max_veh = 20 safety threshold that would have triggered the override. These results are consistent with the published characteristic of ALINEA: a small but real and consistent improvement to mainline travel time and worst-case travel time, traded against ramp delay, in regimes where the freeway is at the capacity knee but not over it.
All experiment parameters, tick-level simulation snapshots, and results are logged to Supabase via batched asynchronous writes, enabling post-hoc analysis and independent reproducibility verification.
4. Implementation
4.1 Development Process
The project followed an iterative, milestone-driven development process organized into three phases, with the two sub-teams working in parallel along clearly defined subsystem boundaries and converging at scheduled integration points.
The first phase (September–January 2026) focused on foundation work. The simulation and control team established the SUMO network, implemented the TraCI subscription client, developed both signal control policies, and stood up the FastAPI backend with WebSocket broadcasting. The computer vision team evaluated three off-the-shelf detection models — YOLOv12, VideoMT, and YOLOE — and confirmed that none could reliably distinguish emergency vehicles from regular traffic, establishing the case for a custom-trained model. The key milestone closing this phase was a working end-to-end loop: SUMO running under TraCI control with live state broadcast to a minimal dashboard client.
The second phase (February–April 2026) focused on pipeline completion. The computer vision team built the CARLA synthetic dataset generation pipeline, trained and evaluated the YOLOv11m model, and integrated ByteTrack tracking. The simulation and control team completed the Next.js dashboard, added the emergency vehicle preemption module, and integrated the CARLA visualization bridge. The key milestone closing this phase was the first complete race-mode experiment, producing quantitative clearance time results across all three demand profiles.
The third phase (May–June 2026) focused on integration and finalization. The computer vision pipeline was wired into the live simulation tick loop, the full analytics layer was completed including red-light and chevron violation detection, highway entry counting, and collision detection, Supabase logging was finalized with batched asynchronous writes, and the experiment comparison interface was polished. The key milestone closing this phase was a fully integrated end-to-end demonstration with perception-derived measurements feeding the adaptive control loop.
Throughout all phases, version control was managed via Git with feature branches and pull requests. A shared API specification document served as the contract between subsystems, with any schema change required to be reflected there before implementation began on either side. Weekly sub-team stand-ups and bi-weekly cross-team integration meetings maintained alignment and surfaced blockers early.
4.2 Detailed Implementation
4.2.1 SUMO Simulation Environment
The simulation network was defined in SUMO's XML network format, modeling a 3×2 arterial grid of six intersections (A0, A1, B0, B1, C0, C1) with realistic lane configurations, turn movements, and vehicle behavior parameters. Three demand profiles — balanced, asymmetric, and extreme — were implemented as route generation scripts that produce arterial.rou.xml from a configurable vehicle count and origin-destination matrix. The route file is regenerated before every non-race simulation start, ensuring that demand profile selection from the dashboard takes immediate effect.
 
Figure 5. 3×2 arterial grid network (intersections A0–C1).
The TraCI client was implemented with subscription-driven state extraction rather than per-vehicle polling. At each tick, subscriptions deliver per-lane queue lengths, vehicle positions, speeds, and signal phase states in a single batch read, keeping the tick loop latency within the real-time threshold even at vehicle counts above 5,000. The client exposes a unified extract_tick_data() function that assembles a TickData Pydantic model from the subscription batch, which is then passed to the active policy and broadcast over WebSocket.
4.2.2 Signal Control Policies
Both policies implement a common controller interface with a single decide(intersections, sim_time) -> PolicyDecision method, allowing them to be swapped without changes to the surrounding infrastructure. The decision carries a list of SignalCommand records that the simulation tick loop applies to TraCI between ticks.
The actuated controller maintains a per-intersection tracker that records the leftover queue — the queue still waiting on each direction at the moment that direction's green phase ends. On every full cycle wrap, the controller updates an exponentially smoothed estimate of each direction's leftover (smoothed_i = α · leftover_i + (1 − α) · smoothed_i_prev, with α = smooth_alpha, default 0.7) and redistributes green time on the next cycle: directions whose smoothed leftover is above the network mean receive a fraction of the total redistributable budget (max_redist_s, default 12 s), drawn proportionally from directions whose smoothed leftover is below the mean. The redistribution is bounded by min_green (default 10 s) and max_green (default 50 s) so that no direction can be starved or run indefinitely.
The core decision logic is shown below:
 
Figure 6. Actuated leftover-queue policy decision step (step() method).

The fixed-time baseline runs the same 4-phase split-phase plan with static green times taken from the network definition (E/W = 35 s, N/S = 15 s, with 3 s yellow and 1 s all-red clearance between each), independent of measured queue state. It implements the same controller interface, making it a drop-in substitute in the tick loop.
All eight policy parameters — base_green_n, base_green_s, base_green_e, base_green_w, min_green, max_green, max_redist_s, smooth_alpha — are exposed as fields of an ActuatedPolicyParams Pydantic model and persisted to the Supabase policy_variants table when saved from the dashboard as a named variant. Variants can be selected from the dashboard's policy picker without restarting the simulation.
4.2.3 Emergency Vehicle Preemption
The preemption module is triggered by a dashboard dispatch event carrying the emergency vehicle's ID and target intersection. On activation, the module registers the vehicle in the simulation via TraCI, begins tracking its position at each tick, and computes the upstream intersection sequence along its route. For each intersection in the sequence, the module injects a phase override into the tick loop that holds the approach phase green until the vehicle clears, then releases control back to the active policy. The preemption state is broadcast in the TickData snapshot so the dashboard can display live corridor status.
4.2.4 FastAPI Backend and WebSocket Layer
The backend is structured as a FastAPI application with four router groups: simulation control (/simulation), policy management (/policy), experiment management (/experiments), and emergency dispatch (/emergency). A SimulationManager singleton owns the TraCI connection lifecycle, enforcing a strict teardown sequence — TraCI disconnect, SUMO subprocess termination, file handle closure — before any new run begins, resolving the socket orphan bug encountered during race-mode development.
The WebSocket manager maintains a set of active connections and broadcasts the serialized TickData snapshot to all clients after each tick. Broadcasting is decoupled from the HTTP layer using an asyncio task queue, so a slow client connection cannot block the simulation tick loop. Supabase writes are similarly decoupled: tick data is buffered in a ten-item in-memory queue and flushed asynchronously using Supabase's bulk insert API, with a write timeout configured so that a slow database response never stalls the simulation.
4.2.5 CARLA Dataset Generation Pipeline
The dataset pipeline operates in two stages. The setup script (setup/scenario.py) provides an interactive interface for positioning cameras within a CARLA map and selecting traffic light actors to monitor, outputting a scenario YAML configuration. The capture script (capture/dataset.py) loads the scenario configuration, connects to CARLA in synchronous mode, spawns vehicles at the configured class ratios, and advances the simulation one tick at a time.
The core capture loop is shown below:
 
Figure 7. CARLA dataset capture routine (capture_frames()).

The explicit world.tick() call before reading camera.get_transform() was a critical fix: in synchronous mode, CARLA does not update actor transforms until a tick is issued, causing the camera location to return (0, 0, 0) without it and the distance filter to reject all vehicles. After each capture session, analyze/dataset.py runs automatically and flags any class whose count falls more than five times below the maximum, triggering a spawn ratio adjustment before the next session.
4.2.6 YOLOv11 Training Pipeline
The training script wraps the Ultralytics YOLO API, loading a yolo11m.pt base checkpoint and fine-tuning on the CARLA dataset. The dataset comprised 12,064 labeled synthetic images, split 80/20 into 9,645 training and 2,419 validation images; a separate held-out 4,979-frame CARLA recording, not used during training or validation, served as the test set. Training used image size 640, batch size 64 (reduced from 96 after an out-of-memory failure at epoch 17), automatic mixed precision, and PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True. The training run completed in approximately three hours on the NVIDIA L40S, producing the final checkpoint used in all subsequent evaluation and deployment.
4.2.7 ByteTrack Integration
ByteTrack was integrated through the Ultralytics tracking API, which provides a unified interface for running detection and tracking in a single inference call. Configuration was tuned for traffic footage: track buffer of 30 frames, match threshold of 0.8, and class-conditional association to prevent silent class switches between visually similar vehicle types. The tracker output provides per-frame track records containing bounding box coordinates, class label, confidence score, and a persistent track ID that is maintained across frames until the track is lost for more than the buffer duration.
4.2.8 Traffic Analytics Layer
Camera calibration is performed interactively using setup/analytics.py, which displays the first frame of a recording and prompts the operator to click four ground control points whose real-world coordinates are known from the CARLA map or physical measurement. OpenCV's findHomography function computes the 3×3 homography matrix from these correspondences, saved alongside lane polygon definitions in an analytics configuration YAML.
The core speed estimation and queue classification logic is shown below:
 
Figure 8. Ground-point projection from a bounding box (vehicle_ground_point()).
 
Figure 9. Lane-polygon queue counting (point_in_polygon / compute_queue_counts()).
 
Figure 10. Per-vehicle speed estimation (SpeedTracker).
 
Figure 11. Per-lane queue tracking (QueueTracker).

Queue classification tests whether a vehicle’s smoothed speed falls below 3 m/s and has remained so for at least 2 seconds, then checks whether the vehicle’s ground-plane position falls within any defined lane polygon. Red-light violation detection, chevron violation detection, highway entry counting, and collision detection extend this same per-frame analytics loop with additional line-crossing, zone, and proximity checks.
 
Figure 12. Annotated detection and tracking on a highway on-ramp.
4.2.9 Next.js Dashboard
The dashboard is structured as a Next.js 14 application with a clear separation between data ingestion, state management, and rendering. A useWebSocket custom hook manages the WebSocket connection lifecycle, parsing incoming TickData JSON frames and dispatching them to the Zustand store. Zustand slices separate intersection state, metrics history, policy configuration, experiment results, and emergency dispatch state, allowing components to subscribe only to the slice they render and avoiding unnecessary re-renders across the full component tree.
The network map renders all six intersections as interactive nodes with real-time signal phase color indicators and vehicle density badges. Clicking an intersection opens a detail panel showing per-lane queue bar charts, a phase countdown timer, and the current policy parameters for that intersection. The metrics history panel plots clearance time, average network speed, and total throughput over a sliding time window using a lightweight charting library. The experiment comparison interface renders side-by-side bar charts for each demand profile, with race outcome summaries showing absolute and percentage clearance time differences. Policy tuning is exposed through a dedicated /policy page rather than the live dashboard sidebar, so policy work does not have to interrupt an ongoing simulation. The page is organized as a left-rail variant list plus a tab strip (Editor, Performance, Compare, Suggest) and supports two policy families — the arterial actuated policy (ActuatedPolicyParams) and the highway ramp-metering policy (AlineaPolicyParams) — selected through a family switcher at the top of the rail. The Editor tab renders the active family's parameter set as labeled numeric fields with per-field bounds derived from a ParamFieldDef[] schema; the Performance tab queries the runs that used the current variant's parameters via JSONB containment (config @> {policy_params: …}) and displays median clearance time, mean trip time, and mean control delay; the Compare tab renders up to three variants side-by-side with a parameter-diff table and a median-metrics row; the Suggest tab calls a Groq llama-3.3-70b-versatile endpoint that mines recent comparison-run history and proposes 2–3 parameter changes with bounds-validated values and one-sentence reasons. Variants are persisted to the Supabase policy_variants table through POST /api/policy/variants, retrieved per-family through GET /api/policy/variants?family={arterial|highway}, and selected for a sim run through a compact variant picker in the dashboard sidebar that reads from the same endpoint. The emergency dispatch panel renders a vehicle selector and target intersection picker, with a dispatch button that calls /emergency/dispatch and a live status indicator showing the active preemption corridor. The Groq AI assistant is implemented as a floating chat panel that sends the stringified current TickData snapshot alongside the operator's natural-language query to the Groq API and displays the response inline.
4.2.10 Computer-Vision Integration into the Live Platform
The computer-vision pipeline was integrated into the live control platform so that an intersection’s traffic state can be sourced from perception rather than simulator ground truth. Because the platform’s CARLA mode renders camera sensors at each junction while the SUMO mode does not, the integration runs entirely in CARLA mode and leaves the SUMO path unchanged.
The detector and analytics primitives were packaged as a self-contained module within the platform’s computer-vision package. A per-camera analyzer combines the YOLOv11m detector with ByteTrack tracking and the homography-based analytics: for each frame it produces bounding boxes, class labels, per-vehicle speed, per-lane queue counts, and red-light violation events. The pixel-to-ground homography for each camera is derived automatically from the camera’s known CARLA transform — position, orientation, and field of view — so no manual four-point calibration is required in simulation.
Lane polygons and violation lines are configured per camera through an editor embedded in the dashboard. The operator opens a camera feed, draws lane polygons and stop lines directly on the live image, and the regions are stored in pixel coordinates keyed by intersection and approach; the analyzer loads these regions to scope its queue and violation counts. To preserve the spatial detail the detector was trained on, the approach cameras render at the model’s 1280×720 training resolution.
Because the platform keeps a single camera active at a time, the analyzer runs on the camera currently being viewed. The resulting queue length and emergency-vehicle presence for that intersection are merged into the broadcast tick data in place of the ground-truth values, while every other intersection continues to use simulator ground truth — a hybrid that holds the perception cost to one stream while demonstrating perception-driven control on a live intersection. The capability is governed by a runtime toggle that is disabled by default, and each analytics session logs per-track data, violation events, and a run summary to disk.
4.2.11 Highway Corridor and Ramp Metering
The highway corridor network is generated programmatically by scripts/generate_highway.py and consists of two parallel four-lane freeways at 100 km/h (eastbound and westbound) flanked by parallel two-lane service roads at 40 km/h. Four signalized ramp meters (E1, E2, W1, W2) sit at the start of 350-metre merge ramps that taper diagonally onto a five-lane acceleration zone, the geometry of which was tuned to allow merging cars to reach mainline speed before the lane is dropped at the downstream taper. Service-road queue length is read from a static lookup table (METER_INFO) that names the upstream service-road edge and the four downstream mainline lanes for each meter; the same table powers occupancy sampling for the ALINEA controller.
 
Figure 13. Highway corridor with ramp metering.
Two ramp-metering controllers implement the common decide(intersections, sim_time) -> PolicyDecision interface used by the arterial controllers. The binary controller (RampMeterController) is the simpler baseline: at each tick it samples mean speed on the four downstream lanes through TraCI, maintains a six-second rolling window, and switches between free-flow mode (19 s green / 1 s red) and metered mode (5 s green / 10 s red) based on a 60 km/h threshold, with a service-road queue override that forces free flow whenever the queue would otherwise spill back. The ALINEA controller (AlineaRampController) implements the closed-loop occupancy-feedback law described in Section 3.2.2. At each control interval (default 30 s) it samples lane.getLastStepOccupancy() across the downstream lanes, averages them, applies the update rule with a configurable gain, clamps the result to the [r_min_vph, r_max_vph] saturation band, and converts the resulting rate to a red-phase duration via the relation red_s = 3600/r − green_s − yellow_s. A queue-safety override pins the rate at r_max whenever the service-road queue reaches queue_max_veh (default 20 vehicles, drained over one interval). Per-meter state — the most recent rate, the cached red duration, the next-update timestamp, and the override flag — is carried in a private _MeterState dataclass.
The controller is exercised by a dedicated A/B harness (scripts/run_highway_ab.py) that launches SUMO headlessly, runs a fixed seed under each of two controllers (always-green and ALINEA), records per-tick downstream occupancy and service-road queue samples, separates trip times into mainline-only and ramp-only buckets, and prints a side-by-side summary. The same harness supports the combined network through a --network combined flag.
4.2.12 Combined Network and Composite Policy
The combined network is generated by scripts/generate_combined.py, which composes the highway corridor and the arterial grid into a single SUMO model. The arterial grid is shifted east by 2,300 metres so that its west boundary stubs land 300 m east of the freeway's east endpoints, and the freeway's directional centerlines are pinned to the same y-coordinates as the arterial rows (row 1 for the eastbound direction, row 0 for the westbound direction). A single colinear feeder edge per direction — three lanes at 50 km/h, 300 m long — bridges each freeway exit to the corresponding arterial entry. Because the feeder is colinear with both the freeway band and the arterial row it joins, no diagonal junction appears in the network, vehicles route without geometric kinks, and the visual presentation of the freeway flowing into the city is continuous.
 
Figure 14. Combined city + highway network (collinear merge).
To run an adaptive arterial controller and a ramp-metering controller against this network simultaneously, a CompositePolicy class is introduced in packages/adaptive-policy/adaptive_policy/composite.py. It accepts a list of child controllers and, on each decide() call, invokes each child with the same intersection list and concatenates the returned SignalCommand lists into a single PolicyDecision. Because both ActuatedController and AlineaRampController ignore intersections that fall outside their tracked set (the arterial controller has a per-intersection phase plan; the ramp controller has an explicit meter_info table), composition is safe by construction with no inter-controller coordination required. The combined branch of SimulationManager._init_policy reads the standard policy_type field for the arterial half and an additional optional ramp_policy_type field for the ramp half, falling back to a legacy single-picker matrix when only one is set. The dashboard exposes the two pickers on the combined network and forwards both fields in the start payload.
4.2.13 Simulation Lab Page
The Simulation Lab is the dashboard's primary surface for comparison-mode work, replacing the original /comparison and /history pages with a single integrated workspace. The page is organized as a left rail of past comparisons (read from GET /api/experiments/), and a tab-less main column that switches between a comparison-builder form when no experiment is selected and a results layout when one is. The builder is a free-form list of rows in which each row configures one run (policy, demand profile, vehicle count, race-or-time-bounded mode, optional variant); rows can be added or removed dynamically and a single shared seed is applied across all of them at submit time so that runs differ only in the configured parameters. A WebSocket subscription to the same /ws/traffic channel that streams TickData also carries experiment_update messages, allowing the page to reflect run-by-run progress as the backend executes the comparison sequentially.
When a comparison completes, the results layout renders two visualizations stacked vertically. The top is a 2×2 grid of bar charts (clearance time, mean trip time, mean control delay, throughput) with one bar per run, color-coded by the run's policy type and with the best-performing bar highlighted in green; the bottom is a tabular results view with one column per metric, the same green highlight applied per column, and a small percentage-improvement caption beneath each non-baseline cell computed against the first run as the baseline. Clicking any row opens a right-side slide-in drawer mounting the RunDetail recharts views (global metrics over sim time, per-intersection queue trends, per-direction breakdown) for that specific run, allowing drill-down without leaving the comparison view. A one-shot cleanup script (scripts/cleanup_standalone_runs.py) clears orphaned single-run rows from the simulation_runs table while preserving comparison sub-runs, keeping the past-comparisons rail focused on actual comparisons.
 
Figure 15. Simulation Lab comparison interface.
4.3 Department-Specific Contributions
Table 2 summarizes the contribution of each team member across the project's work packages.
Table 2: Individual Contributions.
Team Member	Department	Tasks / Contributions	Effort (%)
Alkhozendar	AI Engineering	WP1, WP2, WP4, WP6 ,WP7, WP11	100
Salamoun	AI Engineering	WP1, WP4, WP6, WP11	99.9
Al-Shobaki	AI Engineering	WP4, WP6, WP7, WP11	100
Omar Jayyusi	AI Engineering	WP3, WP5, WP8, WP9, WP10	100
Mohamed Dribika	AI Engineering	WP3, WP8, WP9, WP10	100
Mohammed Al-Labani	AI Engineering	WP3, WP8, WP9, WP10	100
4.3.1 Simulation and Control Sub-Team (Alkhozendar, Salamoun, Al-Shobaki)
This sub-team was responsible for the full simulation and control stack. Alkhozendar led the SUMO network construction, TraCI subscription client, actuated policy implementation, and race-mode experiment framework. Salamoun led the FastAPI backend, WebSocket broadcasting layer, Supabase logging pipeline, and experiment management endpoints. Al-Shobaki led the Next.js dashboard, emergency vehicle preemption module, CARLA bridge integration, and the Groq AI assistant embedding. All three members contributed to policy tuning, experiment execution, and integration testing.
4.3.2 Computer Vision Sub-Team (Al-Labani, Dribika, Jayyusi)
This sub-team was responsible for the full computer vision pipeline. Al-Labani led the pre-trained model evaluation, dataset capture pipeline development, and analytics layer implementation including speed estimation, queue counting, and violation detection. Dribika led model training, evaluation pipeline construction, and tracking metric computation. Jayyusi led the ByteTrack integration, CARLA scenario configuration, and collision detection implementation. All three members contributed to dataset generation, model iteration, and CV-to-backend integration, including the dashboard-side Cameras tab and per-camera region editor that surfaces the analytics outputs in the live platform.
4.3.3 Integration Between Sub-Teams
The two sub-teams' work integrates at two principal points. The first is the TickData schema, which serves as the shared data contract: the simulation and control team defines and broadcasts it, and on the integration branch the computer vision team's per-camera analyzer produces a result object whose queue counts and detected emergency vehicles are merged into the watched intersection's TickData record before broadcast, while richer per-frame outputs (track positions, speeds, violation events, collision detections) are written by the analyzer to per-session log files alongside the WebSocket stream. The second integration point is the CARLA environment, which the simulation team uses as a visualization bridge and the computer vision team uses as a synthetic data source; camera conventions, map selections, and scenario configurations were co-designed to serve both purposes without duplicated effort.
4.4 Integration and System Assembly
Full system integration was the primary focus of the third development phase. The principal integration concern — coupling the computer vision pipeline to the live control platform in CARLA mode through a hybrid per-camera override — is described in detail at §4.2.10 and is not restated here. The remaining integration concerns are addressed below.
Supabase integration required careful management of write throughput. Synchronous per-tick writes at the simulation's default tick rate saturated the free-tier connection pool within minutes of a run starting. The solution — buffering ten ticks and flushing asynchronously via bulk insert — reduced database round trips by an order of magnitude and eliminated write-induced tick loop stalls.
The CARLA–SUMO coordinate frame mismatch was resolved through empirical calibration using known landmark positions in both environments, producing the transformation constants documented in Section 3.2.2. This transformation is applied within the CARLA bridge before any coordinate is used, and is parameterized in the shared configuration so it can be updated if the network geometry changes.
Frontend–backend type drift was resolved through a co-commit convention: any change to a Pydantic model in the backend must include the corresponding TypeScript interface update in the same pull request. A shared docs/api_spec.md document records the current WebSocket schema and all REST endpoint contracts, serving as the authoritative reference for both sub-teams.
4.5 Challenges and Solutions
Challenge 1: Pre-trained models could not distinguish emergency vehicles. Off-the-shelf models with COCO pre-training reliably detected common vehicle categories but produced zero true positives for police cars and had bus recall below 10% in initial testing. The solution was to train a custom YOLOv11m model on a purpose-built synthetic dataset, with spawn ratios tuned iteratively based on automated class distribution analysis after each capture session. Bus recall recovered to 96% and all seven classes achieved acceptable performance after two retraining iterations.
Challenge 2: Real-world training data was inaccessible and insufficient. Municipal CCTV footage was not made available by the relevant authorities, and publicly sourced imagery suffered from severe class imbalance and domain inconsistency. Models trained on this data failed on live feeds despite strong held-out validation metrics. The solution was the CARLA synthetic data pipeline, which provided full control over class distribution, lighting, weather, and camera placement, and produced training data that transferred reliably to the CARLA-rendered test recordings used for evaluation.
Challenge 3: Local GPU hardware was insufficient for final training. Training YOLOv11m at the final dataset size on the RTX 4060 Laptop was estimated to require over 25 hours and encountered out-of-memory failures at batch size 96. The solution was migrating to a rented NVIDIA L40S 48GB GPU via vast.ai, reducing training time to approximately three hours at a cost of $2.50 USD. Batch size was reduced to 64 and PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True was set to manage memory fragmentation.
Challenge 4: TraCI socket lifecycle in race mode. The automated six-race evaluation consistently crashed on the second run due to orphaned socket handles from an incomplete teardown of the previous TraCI connection. The solution was enforcing a strict teardown sequence in SimulationManager — TraCI disconnect, SUMO subprocess termination, file handle closure — before any new run begins. All six races now complete reliably without manual intervention.
Challenge 5: WebSocket performance under high vehicle counts. At vehicle counts above 7,000, tick-loop broadcast latency became noticeable in the dashboard. The solution was reducing the default vehicle count to 5,500 and optimizing the snapshot extraction path by using a lighter extract_race_tick() function during race mode that omits per-vehicle detail fields not needed for policy computation or display.
Challenge 6: CARLA synchronous-mode timing bug. In synchronous mode, CARLA does not update actor transforms until world.tick() is called. An early implementation read the camera location before the first tick, causing it to return (0, 0, 0) and the distance filter to reject all vehicles. The solution was inserting an explicit world.tick() call before any actor position read in the capture pipeline.
Challenge 7: TypeScript and Pydantic type drift. As new fields were added to backend models during development, the corresponding TypeScript interfaces fell out of sync, producing runtime errors that were difficult to diagnose. The solution was the co-commit convention and shared API specification document described in Section 4.4, which eliminated further drift for the remainder of the project.
Challenge 8: Colinear-feeder geometry on the combined network. The first version of the combined city+highway network connected the freeway exits to the arterial grid through diagonal merge edges, which produced kinked routes, mismatched lane counts at the merge point, and visually discontinuous traffic flow between the two halves of the network. The solution was to pin the freeway's eastbound and westbound centerlines to the same y-coordinates as the arterial grid's row 1 and row 0 respectively, shift the arterial grid 2,300 metres east of the freeway, and bridge the two halves with a single 300-metre three-lane feeder edge per direction laid out colinearly with both bands. With the geometry corrected, vehicles route from the freeway into the city without a junction turn, and the visual presentation of the merge is continuous.
Challenge 9: Composite-policy command ownership on the combined network. Running an arterial actuated controller and a ramp ALINEA controller against the same SUMO network simultaneously risked the two controllers issuing conflicting commands for the same intersection identifier, since both implement the same decide(intersections, sim_time) -> PolicyDecision interface. The solution was to make ownership implicit in each controller's state: the arterial controller's per-intersection phase plan covers only the grid intersection IDs, the ramp controller's METER_INFO table covers only the four meter IDs, and each silently ignores any intersection it does not own. The CompositePolicy then concatenates the two children's SignalCommand lists with no inter-controller coordination required, and the composition is safe by construction across every combination of arterial and ramp policy.
5. Testing and Validation
5.1 Test Plan
Validation was conducted independently on each subsystem and then end-to-end on their integration. The simulation and control subsystem was validated at three levels. Component-level unit tests exercised each signal controller in isolation against synthetic intersection states: the actuated leftover-queue policy was verified to redistribute green time toward under-served directions only after a full cycle wrap, the ALINEA ramp-metering controller (packages/adaptive-policy/tests/test_alinea.py) was verified across seven cases covering the closed-loop feedback update, saturation at r_min and r_max, queue-override activation at queue_max_veh, command emission on phase entry only, and red-duration recovery from cached ALINEA state, and the composite policy (packages/adaptive-policy/tests/test_composite.py) was verified to concatenate child controllers' SignalCommand lists correctly under three composition patterns. Integration tests exercised the SimulationManager lifecycle against a live SUMO process across all three networks (arterial, highway, combined) and confirmed correct policy dispatch including the combined-network composition of two adaptive controllers. System-level tests exercised the full operator-facing workflow: starting and stopping a simulation from the dashboard, switching variants on the /policy page, running a two-run comparison from the Simulation Lab, drilling into a single run's per-tick charts, and dispatching an emergency vehicle through the priority corridor. The computer-vision and integration components were validated at three corresponding levels — unit tests on the detector primitives, the homography calibration, and the speed/queue/violation trackers; integration tests of the full per-camera analyzer on held-out CARLA recordings; and system tests of the live behaviour in CARLA mode covering the annotated camera stream, the per-camera region editor, and the hybrid override of the watched intersection's queue and emergency state in the broadcast TickData. Model accuracy and tracking quality were evaluated quantitatively on a held-out test recording using the detection and CLEAR-MOT metrics reported in §5.3.
5.2 Test Results
The principal test cases for the computer-vision pipeline and its integration are summarized below, with their expected and observed outcomes. All listed cases passed; the failure modes encountered during development are discussed in Sections 4.5 and 6.2.
Test ID	Test Description	Expected Result	Actual Result	Status
(Pass/Fail)
T-01	Detection accuracy on the held-out CARLA test recording	mAP50 at least 0.85 across the seven classes	mAP50 = 0.949, mAP50-95 = 0.865	Pass
T-02	Emergency-vehicle classification	Ambulance, police car, and fire truck detected as distinct classes	All three detected; bus recall recovered to 96%	Pass
T-03	Multi-object tracking (ByteTrack)	Persistent IDs, MOTA at least 0.70	MOTA 0.78, IDF1 0.88; 47 ID switches over 47,014 detections	Pass
T-04	Analytics pipeline on a recording	Speed, per-lane queue, and violation events produced and logged	Speed, queue (3 m/s), and violations logged to CSV and JSON	Pass
T-05	Vision-to-control integration (CARLA mode)	Watched intersection driven by vision, others by ground truth	Hybrid override confirmed; toggling vision off restores ground truth	Pass
T-06	Actuated leftover-queue policy vs fixed-time baseline across all three demand profiles in race mode	Actuated clearance time reduced by at least 20 % on every profile	Reductions of 40 % (extreme), 48 % (asymmetric), 54 % (balanced)	Pass
T-07	Race-mode framework reproducibility under fixed seed	Two runs of the same configuration produce identical clearance time and per-tick metrics	Identical results confirmed across all six profile × policy combinations after the SimulationManager teardown fix described in §4.5	Pass
T-08	Emergency vehicle preemption end-to-end	Dispatched emergency vehicle clears its target corridor without phase delay	Corridor cleared with no recorded preemption interruptions across five dispatch tests	Pass
T-09	ALINEA ramp-metering controller on highway corridor under stress demand with downstream lane closure	Maximum bottleneck occupancy reduced relative to always-green control	Maximum occupancy reduced from 29.5 % to 28.0 % (−4.9 % rel.); ramp queue stayed below the configured safety threshold	Pass
T-10	Composite policy on the combined network (actuated arterial + ALINEA ramp)	Both child controllers run in tandem; arterial signals show leftover-queue redistribution while ramp meters show occupancy-feedback metering	CompositePolicy.decide() confirmed to dispatch to both children correctly; 4,000-vehicle race completed with 1.0 % mainline trip-time improvement and ramp queue capped at 21 vehicles	Pass

5.3 Performance Evaluation
The computer-vision and integration success criteria, drawn from the project proposal, are evaluated below against their target values.
Success Criterion	Target Value	Achieved Value	Met?
(Yes/No/Partial)
SC-1  Detection accuracy (mAP50)	at least 0.85	0.949	Yes
SC-2  Real-time throughput	at least 20 FPS	27.7 FPS	Yes
SC-3  Emergency-vehicle classification	Distinguish emergency vehicles	Ambulance, police, and fire classified	Yes
SC-4  Tracking quality (MOTA)	at least 0.70	0.78	Yes
SC-5  Network clearance time improvement (actuated vs fixed-time)	at least 20 % on the balanced profile	54 % on balanced; 48 % on asymmetric; 40 % on extreme	Yes
SC-6  Race-mode evaluation reliability	All six races complete without manual intervention	All six races complete reliably after SimulationManager teardown fix	Yes
SC-7  ALINEA ramp metering mainline trip-time improvement on combined network	Measurable mainline reduction relative to always-green	1.0 % mean and 1.9 % 90th-percentile mainline trip-time reduction at 4 000 vehicles	Yes

5.4 User Feedback (if applicable)
[If user testing was conducted, present the feedback received and any changes made based on this feedback.]
6. Results and Discussion
6.1 Final Results
The computer-vision subsystem met or exceeded every target defined in the project proposal. The custom-trained YOLOv11m detector reached a mAP50 of 0.949 and mAP50-95 of 0.865 on a held-out 4,979-frame CARLA test recording, with precision of 0.970 and recall of 0.900 across the seven vehicle classes, surpassing the proposal’s 0.85 accuracy target. The training and validation curves over the 39 training epochs are shown in Figure 16; the validation mAP rises steadily and plateaus without divergence, indicating a well-fit model.
 
Figure 16. YOLOv11m training and validation metrics across 39 epochs.
Per-class performance is summarized by the normalized confusion matrix in Figure 17. All seven classes are recognized along the diagonal with high accuracy, including the fine-grained emergency categories (ambulance, police car, fire truck) that off-the-shelf detectors could not distinguish. Bus recall, which had collapsed to 7.9% under the original class imbalance, recovered to 96% after the spawn-ratio correction.
 
Figure 17. Normalized confusion matrix across the seven vehicle classes.
The precision-recall curve in Figure 18 confirms strong detection quality across operating points, consistent with the reported mAP50 of 0.949. Qualitative results on held-out validation frames are shown in Figure 19, where vehicles of every class are localized and labeled correctly under varied lighting and camera angles.
 
Figure 18. Precision-recall curve across all classes.
 
Figure 19. Sample detections on held-out validation frames.
Coupled with ByteTrack multi-object tracking, the pipeline produced a MOTA of 0.78 and an IDF1 of 0.88 with only 47 identity switches across 47,014 detections, and ran at 27.7 FPS on a consumer-grade laptop GPU, above the 20 FPS real-time target. The analytics layer built on this pipeline delivers per-lane speed estimation, queue counting at a 3 m/s threshold, red-light and chevron violation detection, highway entry counting, and collision detection, all calibrated through a 4-point homography. In CARLA mode, these perception outputs drive the dashboard and can feed the adaptive policy in place of simulator ground truth for the intersection under view.
The simulation and control subsystem also met or exceeded every quantitative target set by the project proposal. The actuated leftover-queue controller, evaluated against the fixed-time baseline through the race-mode framework across all three demand profiles, reduced network clearance time by 54 % on the balanced profile, 48 % on the asymmetric east-west profile, and 40 % on the extreme east-west profile, exceeding the proposal's ≥ 20 % target by a wide margin. Per-intersection queue time-series telemetry, captured at every cycle wrap and persisted to Supabase, identified a persistent chokepoint at intersections B0 and B1 — the network's central east-west corridor — that the policy cannot fully resolve through phase-duration adjustments alone, since the constraint is structural rather than control-derived. The race-mode framework itself, which guarantees identical initial conditions through fixed-seed route regeneration and a strict SimulationManager teardown sequence between runs (the resolution of Challenge 4 in §4.5), makes the policy comparison independently reproducible; every race outcome — parameters, per-tick metrics, and final clearance — is logged to the Supabase persistence layer and reachable from the Simulation Lab page for revisitation.
 
Figure 20. Network clearance time: actuated vs fixed-time across three demand profiles.
On the highway corridor, the ALINEA ramp-metering controller was evaluated against an always-green baseline and a binary speed-threshold controller under a stress scenario featuring approximately 10,900 vehicles over 25 minutes with a downstream lane closure injected mid-run to force a capacity drop. ALINEA reduced the maximum bottleneck occupancy from 29.5 % to 28.0 % (a 4.9 % relative reduction at the worst-case point) while the binary baseline showed no measurable change. On the combined city+highway network at 4,000 vehicles, where the freeway exit cascades into three signalized intersections and thus exhibits a real downstream capacity constraint, ALINEA delivered a 1.0 % mainline mean trip-time improvement and a 1.9 % improvement at the 90th percentile, with the ramp queue stabilizing at 21 vehicles — just above the 20-vehicle safety threshold (queue_max_veh) that would have triggered the override. These outcomes are quantitatively consistent with the published characteristic of ALINEA: modest but consistent mainline improvements at the cost of ramp delay, in operating regimes where the freeway sits near the capacity knee but not far beyond it. The Simulation Lab page provided the operational frame for these comparisons, with side-by-side bar charts of the four primary KPIs and per-row drill-down into per-tick metric histories for inspection.
6.2 Analysis and Discussion
The results confirm that fine-grained vehicle classification — in particular the distinction between emergency and ordinary vehicles — is achievable only with a purpose-built model. The custom YOLOv11m detector resolved the emergency categories that off-the-shelf COCO-pretrained models failed on entirely, and the synthetic CARLA dataset provided the control over class balance, lighting, and camera placement needed to reach 0.949 mAP50. The most instructive result was the recovery of bus recall from 7.9% to 96% through spawn-ratio correction alone, confirming that class imbalance, not model capacity, was the limiting factor. Tracking performance (MOTA 0.78, IDF1 0.88) is strong for a single-camera setup; the 47 identity switches concentrated at extended occlusions by larger vehicles and at frame-boundary re-entries — the expected failure modes of single-view tracking — and motivate the multi-camera fusion identified in future work. On the integration side, sourcing an intersection’s queue and emergency state from vision in place of ground truth demonstrates that the perception pipeline can stand in for privileged simulator state, the essential step toward real-camera deployment where no ground truth exists.
The simulation and control results admit a parallel interpretation. The 40–54 % clearance improvement of the leftover-queue controller is consistent with the demand–capacity mismatch the actuated policy is designed to address: a fixed-time plan oversupplies green time to under-demanded approaches and undersupplies it to congested ones, and the leftover-queue feedback signal — the queue still waiting at the end of each direction's green phase — directly quantifies this mismatch on every cycle. The EMA smoothing across cycles damps the response so the policy does not chase transient fluctuations, while the max_redist_s cap bounds the per-cycle adjustment so the system converges rather than oscillates. The persistent B0/B1 chokepoint, however, exposes the limits of single-intersection control: when the structural geometry of an intersection prevents enough vehicles from clearing per cycle regardless of green allocation, network-level coordination or geometric modification — not policy tuning — is the appropriate remedy. This is a meaningful methodological finding rather than a system failure, and motivates the future work on multi-intersection coordination identified in §9.3. The ALINEA mainline improvement of 1.0 % on the combined network is modest in absolute terms but is squarely in line with the published characteristic of ALINEA in moderately oversaturated regimes: ALINEA's value is precisely that it converts ramp delay into mainline benefit, and the visibility of that trade-off in the combined-network experiment confirms that the controller is responding to the same physically meaningful occupancy signal that the published deployments rely on. The Simulation Lab page is the operational embodiment of this evaluation discipline — by surfacing percentage improvement against a baseline and per-run drill-down inline, it makes every policy comparison self-documenting rather than dependent on transient operator memory or external spreadsheets.
6.3 Comparison with Original Objectives
Measured against the proposal’s objectives for the computer-vision subsystem, every target was met or exceeded. Detection accuracy reached mAP50 0.949 against a 0.85 target (exceeded). Real-time throughput reached 27.7 FPS against a 20 FPS target (exceeded). Fine-grained emergency-vehicle classification, identified in the proposal as the core differentiator, was achieved across the ambulance, police-car, and fire-truck categories (met). The analytics objectives — speed estimation, queue counting, and homography-based calibration — were all delivered, and the project additionally implemented red-light and chevron violation detection, highway entry counting, and collision detection beyond the original scope. The integration objective of driving the control loop from perception was met in CARLA mode through the hybrid per-camera override.
The three additional objectives introduced at §1.3 were also delivered. The ALINEA ramp-metering controller (objective 10) was implemented and evaluated against a binary speed-threshold baseline and an always-green control on the standalone highway corridor; under a stress scenario with a downstream lane closure injected mid-run, ALINEA reduced maximum bottleneck occupancy from 29.5 % to 28.0 % (a 4.9 % relative reduction at the worst-case point) while the binary baseline showed no measurable change, confirming that the closed-loop occupancy-feedback law responds to the same physically meaningful signal that the published deployments rely on. The combined city+highway network and the composite policy abstraction (objective 11) were delivered and exercised end-to-end through the A/B harness; on a 4,000-vehicle race a 1.0 % mainline mean trip-time improvement and a 1.9 % 90th-percentile improvement were measured, with the ramp queue stabilizing at 21 vehicles — just above the 20-vehicle safety threshold (queue_max_veh) that would have triggered the override — as reported at §3.4.3. The Simulation Lab page (objective 12) was implemented as the dashboard's primary comparison surface, retaining all past comparisons in its left rail and supporting per-row drill-down through an inline detail drawer, replacing the original /comparison and /history pages with a single integrated workspace.
7. Project Management Summary
7.1 Work Breakdown and Schedule
The project was executed across two academic terms and completed on schedule, with all planned deliverables met by the end of the spring term. The final Gantt chart comparing planned and actual timelines is presented in Figure 21.
 
Figure 21. Project Gantt chart: planned versus actual timeline.
All eleven work packages were completed within their originally planned windows. No deliverable slipped beyond its scheduled term. Minor within-term timing adjustments were made in two areas. The computer vision training pipeline (WP8) was delayed by approximately two weeks relative to its internal milestone due to the pivot from real-world to synthetic training data, which required rebuilding the dataset generation pipeline from scratch. This delay was fully absorbed within the spring term without affecting downstream work, as the simulation and control subsystem continued progressing independently during that period. The Supabase logging pipeline (WP11) was similarly delayed within its window due to write throughput issues encountered during high-tick-rate evaluation runs, resolved through the batched asynchronous insert approach described in Section 4.4.
The decision to add three scope extensions beyond the original proposal — the CARLA visualization bridge, the emergency vehicle preemption module, and the Groq AI assistant — introduced unplanned work during the second phase. These were managed by implementing each as an optional, additive feature rather than a modification to existing behavior, which contained their risk and prevented regressions in the core system. None of the extensions affected the schedule for any original deliverable.
Overall schedule adherence was strong. The project reached its final demonstration milestone on time with all core objectives complete and all three scope extensions fully integrated.
7.2 Individual Contributions
Table 3 summarizes each team member's key contributions and overall effort across the project.
Table 3: Individual Contributions.
Team Member	Department	Key Contributions	Overall Effort (%)
Mohamed Aiman Alkhozendar	AI Engineering	SUMO network construction, TraCI subscription client, actuated and fixed-time signal control policies, race-mode experiment framework, policy variant persistence, demand profile generation	100
Abdullah Shaher Salamoun	AI Engineering	FastAPI backend, WebSocket broadcasting layer, Supabase logging pipeline, experiment management endpoints, REST API specification, system integration testing	100
Abdullah Hani Al-Shobaki	AI Engineering	Next.js dashboard, Zustand state management, emergency vehicle preemption module, CARLA visualization bridge, Groq AI assistant embedding, dashboard QA	100
Omar Kamal Jayyusi	AI Engineering	ByteTrack integration, CARLA scenario configuration, collision detection implementation, pre-trained model evaluation, dataset generation support, simulation tool creation,
Final System Integration	100
Mohamed Dribika	AI Engineering	YOLOv11 model training, evaluation pipeline construction, tracking metric computation, confusion matrix analysis, dataset iteration,
Real-life model training	100
Mohammed Ahmed Al-Labani	AI Engineering	Pre-trained model evaluation, CARLA dataset capture pipeline, analytics layer (speed estimation, queue counting, red-light and chevron violation detection, highway entry counting)	100
7.3 Inter-Departmental Collaboration Assessment
The project was executed jointly by two sub-teams operating within the same department but along clearly separated subsystem boundaries. Reflecting on the collaboration across the full project lifecycle, several aspects worked well and a small number of areas present lessons for future joint projects.
On the positive side, the parallel development structure proved highly effective. Because the two subsystems had clearly defined interfaces — principally the TickData schema and the CARLA environment conventions — both teams were able to reach advanced states of maturity independently before integration began. This meant that integration, while non-trivial, was not blocked by incomplete work on either side. The weekly sub-team stand-ups and bi-weekly cross-team integration meetings provided sufficient coordination bandwidth without creating meeting overhead that would have slowed individual development. The shared Git repositories, API specification document, and co-commit convention collectively prevented the type drift and schema mismatch issues that would otherwise have been difficult to diagnose at integration time.
The dual use of CARLA — as a visualization bridge for the simulation team and as a synthetic data source for the computer vision team — was a particularly effective point of collaboration. Co-designing the scenario configurations and camera conventions early meant that both teams could use the same CARLA maps and setups without duplicated effort, and the photorealistic rendering that made CARLA useful for visualization also made the synthetic training data visually rich.
The principal area for improvement was the timing of interface contract definition. Despite establishing the API specification document, the TickData schema evolved as new features were added, requiring retroactive updates on both sides on several occasions. In a future project of this type, locking the core data contract before implementation begins on either subsystem — and treating any change to it as a formal change request requiring both teams to sign off — would reduce the integration friction further.
The joint-department structure was well-suited to this project. The problem decomposed naturally into perception and control subproblems with a clean interface between them, making parallel development straightforward. Projects where the subsystem boundary is less clean — where the two teams' outputs are more tightly coupled at a fine-grained level — might benefit from more frequent integration checkpoints or shared ownership of the interface layer.
7.4 Budget and Resources
The project was developed almost entirely using open-source and free-tier tools, resulting in minimal direct monetary expenditure. Table 4 presents the final budget against original estimates.
Table 4: Budget and Resources.
Resource	Tool / Service	Estimated Cost	Actual Cost	Status
Traffic simulation	SUMO 1.26.0 (open source)	Free	Free	In use
3D simulation	CARLA 0.9.16 (open source)	Free	Free	In use
Backend framework	FastAPI + Uvicorn (open source)	Free	Free	In use
Frontend framework	Next.js 14 + React 18 (open source)	Free	Free	In use
Database	Supabase (free tier)	Free	Free	In use
AI assistant API	Groq API (free tier)	Free	Free	In use
CV detection framework	Ultralytics YOLOv11 (open source)	Free	Free	In use
Multi-object tracking	ByteTrack via Ultralytics (open source)	Free	Free	In use
Preliminary CV training	Google Colab (NVIDIA A100)	Subscription	Subscription	Used
Final CV training	vast.ai (NVIDIA L40S 48GB)	~$5.00 USD	$2.50 USD	Used
Development support	Claude Max plan	Subscription	Subscription	In use
Source control	GitHub (free public repository)	Free	Free	In use
Development hardware	Team members' personal machines	—	—	In use
8. Ethical, Safety, and Sustainability Considerations
8.1 Ethical Considerations
The primary ethical consideration in a traffic monitoring system of this nature is data privacy — specifically, the risk that camera-based vehicle detection could be used to identify and track individuals without their knowledge or consent. This concern was addressed structurally rather than procedurally: the system was developed and validated entirely within a simulation environment using synthetic CARLA-generated data, meaning no real individuals were recorded, identified, or processed at any stage of the project. The training dataset contains no real-world imagery of people or vehicles captured in public spaces, and no connection to live municipal camera feeds was established during development or evaluation.
For future real-world deployment, this consideration would need to be revisited carefully. Camera-based traffic monitoring systems that process live feeds in public spaces are subject to data protection regulations in most jurisdictions, including the General Data Protection Regulation in the European Union and equivalent national frameworks. The system's computer vision pipeline, as currently implemented, detects and tracks vehicles by class but does not perform license plate recognition, driver identification, or any form of biometric processing. This limits its privacy exposure relative to systems that do, but operators deploying it on live feeds would still need to ensure compliance with applicable regulations, implement appropriate data retention policies for logged footage and analytics, and provide public notice of monitoring where required by law.
The use of generative AI tools — including Claude, ChatGPT, and GitHub Copilot — for code generation, debugging, and report drafting throughout the project is declared in the AI Usage Declaration at the front of this report. All AI-generated outputs were reviewed, verified, and substantially rewritten by team members before inclusion in either the codebase or the report. No AI-generated content was accepted without validation against the project's own experimental results and documentation.
Emergency vehicle preemption introduces a specific ethical dimension: the system grants signal priority to vehicles dispatched through the dashboard, which in a real deployment would need to be secured against unauthorized dispatch. The current implementation does not include authentication on the emergency dispatch endpoint, which is acceptable in a simulation context but would be a critical security requirement before any operational deployment. This limitation is acknowledged and documented as a known gap for future development.
8.2 Safety Considerations
As a software-only simulation system with no physical hardware components, the project presents no direct physical safety risks during development, testing, or demonstration. No electrical systems, mechanical components, or physical road infrastructure were involved at any stage.
However, the intended application domain — urban traffic signal control — carries significant real-world safety implications that informed several design decisions. Signal control errors in a live deployment could increase collision risk, delay emergency vehicle response, or create dangerous pedestrian crossing conditions. These considerations shaped the system's design in three ways.
First, the actuated policy was designed with explicit minimum and maximum green time bounds that prevent pathological outputs — phases that are too short to clear a pedestrian crossing or too long to permit emergency vehicle access — regardless of the queue measurements fed to it. These bounds are configurable but require deliberate operator action to change, providing a soft safety guardrail against misconfiguration.
Second, the emergency vehicle preemption module was implemented as an override layer that takes priority over all other policy logic when active. This ensures that once an emergency vehicle is dispatched, the signal corridor clearing is not delayed or interrupted by normal queue-driven phase decisions.
Third, the system's fallback behavior was designed to be safe rather than silent. If the CARLA bridge is unavailable, the system continues operating on SUMO state rather than crashing. If the WebSocket connection to a dashboard client drops, the simulation continues running and logging without waiting for reconnection. If a Supabase write times out, the tick loop continues without blocking. These graceful degradation patterns ensure that a component failure does not propagate into a system-wide halt that could leave a real intersection without signal control.
Collision detection, implemented as part of the analytics layer, directly supports road safety by identifying probable impact events in real time from camera feeds, enabling faster incident response than would be possible through manual monitoring alone.
8.3 Sustainability Considerations
The project's sustainability profile is favorable across several dimensions. The entire software stack is built on open-source tools with permissive licenses, eliminating licensing costs and making the system accessible to municipalities and researchers without significant financial barriers. The system is designed to run on consumer-grade GPU hardware — validated at 27.7 FPS on a mid-range laptop GPU — removing the need for specialized or energy-intensive compute infrastructure for deployment.
The use of cloud GPU rental for model training, rather than purchasing dedicated hardware, represents a more resource-efficient approach for research-scale workloads. The final training run consumed approximately three hours of compute on a shared cloud GPU at a cost of $2.50 USD, a fraction of the embodied energy and material cost of purchasing equivalent dedicated hardware for a single training run.
At the application level, the system's core function — reducing unnecessary vehicle idling at intersections through adaptive signal control — has a direct positive environmental impact. The 40–54% reduction in network clearance time demonstrated across all three demand profiles corresponds to a meaningful reduction in cumulative vehicle idling time, and by extension in fuel consumption and tailpipe emissions, relative to the fixed-time baseline. While precise emissions quantification was outside the scope of this project, the directional impact is clear and consistent with the broader smart-city motivation for adaptive signal control research.
The synthetic data approach also has a sustainability dimension: generating training data in simulation rather than deploying physical data collection infrastructure eliminates the material and energy costs of camera installation, networking, and storage at multiple real-world locations, and avoids the ongoing operational footprint of a live data collection system.
9. Conclusions
9.1 Summary of Achievements
This project successfully delivered a complete, integrated, and quantitatively validated AI-based adaptive traffic management system within a single academic year, meeting or exceeding all original objectives and delivering three additional features beyond the proposed scope.
The core achievement of the simulation and control subsystem is a demonstrated 40–54% reduction in network clearance time over a fixed-time baseline across three independent demand profiles, using an actuated signal control policy driven by real-time per-lane queue measurements. This result was produced through a reproducible race-mode experiment framework that logged all parameters and outcomes to a persistent Supabase database, making the findings independently verifiable. The policy is fully parameterizable through an eight-field configuration model, with named variants persisted to disk and selectable from the dashboard without restarting the simulation.
The core achievement of the computer vision subsystem is a custom-trained YOLOv11m model that achieves mAP50 of 0.949 and mAP50-95 of 0.865 across seven vehicle classes including fine-grained emergency vehicle categories, surpassing the proposal's target accuracy of 0.85 by a meaningful margin. Combined with ByteTrack multi-object tracking — yielding MOTA of 0.78 and IDF1 of 0.88 with only 47 ID switches across 47,014 detections — the pipeline runs at 27.7 FPS on consumer-grade hardware, exceeding the 20 FPS real-time target. The analytics layer built on top of this pipeline delivers lane-level speed estimation, per-lane queue counting, red-light and chevron violation detection, highway entry counting, and collision detection, all calibrated through a standard 4-point homography suitable for retrofit deployment on existing camera infrastructure.
The integration achievement — sourcing an intersection’s queue and emergency-vehicle state from the vision pipeline in CARLA mode, in place of the simulator’s ground truth, so the adaptive policy can be driven by perception on rendered camera feeds — closes the feedback cycle between the two subsystems and represents the most technically ambitious deliverable of the project. The unified Next.js dashboard brings all components together under a single interface supporting live monitoring, policy tuning, emergency vehicle dispatch, experiment comparison, and natural-language querying through an embedded AI assistant.
Beyond the original scope, the project delivered a CARLA 3D visualization bridge providing photorealistic simulation rendering, an emergency vehicle preemption module supporting manual dispatch and signal corridor clearing, and a Groq-powered AI assistant enabling natural-language interaction with live simulation state. The total direct financial expenditure across the entire project was $2.50 USD, demonstrating that a system of this capability is achievable on an open-source, commodity-hardware foundation.
9.2 Lessons Learned
The project generated a substantial set of lessons spanning technical practice, data engineering, and team coordination. The most significant are summarized below.
On the technical side, the most impactful lesson was that fine-grained visual classification cannot be delegated to general-purpose pre-trained models. Off-the-shelf detectors performed well on common vehicle categories but were unable to distinguish police cars from regular passenger vehicles — a distinction that is critical for emergency vehicle preemption. The investment in building a purpose-specific synthetic dataset and training a custom model was the single most consequential technical decision of the project, and one that should be anticipated from the outset in any system requiring subclass distinctions within a broad category.
Closely related was the lesson that class imbalance is the dominant factor in minority-class recall, more so than model architecture or training duration. Doubling the spawn ratios of rare classes in the CARLA dataset improved bus recall from 7.9% to 96% — a change that took hours to implement and produced gains that additional training epochs could not have achieved. Automated dataset analysis after every capture session, flagging imbalances before they propagate into training, proved essential for catching this early.
The domain gap between synthetic training data and real-world deployment is real but manageable with deliberate dataset design. Cycling through thirteen weather presets and multiple camera placements per scenario provided sufficient visual diversity for the model to generalize within the synthetic domain. Full real-world transfer would require additional domain adaptation steps, but the synthetic-first approach was the right starting point given the inaccessibility of real municipal footage.
On the systems engineering side, the most important lesson was that integration contracts should be the first artifact produced, not a retroactive one. The TypeScript–Pydantic type drift that caused runtime errors during development would have been eliminated entirely if the shared data schema had been locked and formalized before either team began building. In any project where two independently developed components must exchange structured data, the interface specification is more important than either component individually.
Reproducibility should be designed in from the start. The need for fair, reproducible policy comparison was foreseeable from the project's first day, but building race mode required retrofitting the simulation manager and configuration system after the fact. Starting with reproducibility as a first-class design requirement — fixed seeds, regenerated route files, logged parameters — would have saved significant rework.
Cloud GPU rental fundamentally changes the economics of deep learning research. At approximately $0.50 per hour, training a competitive object detection model is accessible to any team with a credit card, and the three-hour training time enabled rapid iteration that would have been impractical with local hardware. This should be the default assumption for any future project involving model training at meaningful dataset sizes.
On the team and project management side, the parallel subsystem structure worked well precisely because the interface between the two sub-teams was narrow and well-defined. When the interface was ambiguous — as it was early in the project before the API specification document was established — integration produced surprises. The lesson is that the bandwidth of cross-team coordination can be kept low only if the interface contract is kept precise and current.
Scope additions, while all ultimately valuable, introduced unplanned work mid-sprint. The feature-flagging approach — implementing new features as optional, additive extensions rather than modifications to existing behavior — was the right mitigation and should be adopted as a default practice from the start rather than introduced reactively.
9.3 Future Work and Recommendations
Several directions for future development follow directly from the project's outcomes and its documented limitations.
The most immediately actionable extension is real-world camera deployment. The analytics pipeline was designed with retrofit deployment in mind — the 4-point homography calibration requires no specialized hardware — and the YOLOv11m model provides a strong starting point for fine-tuning on real-world traffic footage. A domain adaptation step using a small labeled real-world dataset, combined with the existing CARLA-trained weights as initialization, would likely close the synthetic-to-real gap with modest additional annotation effort. Partnering with a municipality to obtain even a limited live camera feed for validation would be a high-value next step.
Multi-camera fusion would address the single-camera occlusion bias identified as a fundamental limitation of the current tracking pipeline. Extending the analytics layer to fuse detections and tracks across multiple camera views of the same intersection would improve tracking continuity through extended occlusions and provide more reliable queue measurements for the control policy. This is a well-studied problem in the multi-target tracking literature and a natural next development phase.
Reinforcement learning-based signal control represents a longer-term research direction. The current actuated policy is interpretable and tunable but relies on hand-designed decision rules. Training a deep reinforcement learning agent within the existing SUMO environment, using the race-mode framework for evaluation, would provide a direct comparison between learned and rule-based policies on the same network and demand profiles. The reproducible experiment infrastructure built for this project is already well-suited to support this comparison.
License plate recognition and individual vehicle re-identification are natural extensions of the computer vision pipeline for enforcement and origin-destination analysis applications, though they introduce significant additional privacy considerations that would need to be addressed through appropriate legal and technical safeguards before deployment.
The B0 and B1 intersection chokepoint, identified as a structural network geometry constraint that the adaptive policy cannot fully resolve through timing adjustments alone, warrants further investigation. Potential mitigations include geometric network modifications — adding turn lanes or adjusting lane assignments — that could be evaluated within the existing SUMO environment without physical construction, and more sophisticated spillback-aware policy variants that anticipate downstream queue buildup before it occurs.
Finally, the dashboard's AI assistant currently operates on a snapshot of the current simulation state. Extending it with access to historical experiment data and trend analysis — allowing operators to ask questions like "which demand profile produces the worst chokepoint behavior" or "how has average speed changed over the last ten runs" — would significantly increase its operational value and represents a straightforward extension of the existing Groq integration.
References
[1] P. A. Lopez et al., "Microscopic traffic simulation using SUMO," in Proc. 21st IEEE Int. Conf. Intell. Transp. Syst. (ITSC), Maui, HI, USA, Nov. 2018, pp. 2575–2582.
[2] A. Dosovitskiy, G. Ros, F. Codevilla, A. Lopez, and V. Koltun, "CARLA: An open urban driving simulator," in Proc. 1st Annu. Conf. Robot Learn. (CoRL), Mountain View, CA, USA, Nov. 2017, pp. 1–16.
[3] G. Jocher and J. Qiu, "Ultralytics YOLO11," Ultralytics, 2024. [Online]. Available: https://github.com/ultralytics/ultralytics
[4] J. Redmon, S. Divvala, R. Girshick, and A. Farhadi, "You only look once: Unified, real-time object detection," in Proc. IEEE Conf. Comput. Vis. Pattern Recognit. (CVPR), Las Vegas, NV, USA, Jun. 2016, pp. 779–788.
[5] Y. Zhang et al., "ByteTrack: Multi-object tracking by associating every detection box," in Proc. Eur. Conf. Comput. Vis. (ECCV), Tel Aviv, Israel, Oct. 2022, pp. 1–21.
[6] N. Wojke, A. Bewley, and D. Paulus, "Simple online and realtime tracking with a deep association metric," in Proc. IEEE Int. Conf. Image Process. (ICIP), Beijing, China, Sep. 2017, pp. 3645–3649.
[7] A. Bewley, Z. Ge, L. Ott, F. Ramos, and B. Upcroft, "Simple online and realtime tracking," in Proc. IEEE Int. Conf. Image Process. (ICIP), Phoenix, AZ, USA, Sep. 2016, pp. 3464–3468.
[8] A. Paszke et al., "PyTorch: An imperative style, high-performance deep learning library," in Proc. 33rd Conf. Neural Inf. Process. Syst. (NeurIPS), Vancouver, BC, Canada, Dec. 2019, pp. 8024–8035.
[9] G. Bradski, "The OpenCV library," Dr. Dobb's J. Softw. Tools, vol. 25, no. 11, pp. 120–125, Nov. 2000.
[10] T.-Y. Lin et al., "Microsoft COCO: Common objects in context," in Proc. Eur. Conf. Comput. Vis. (ECCV), Zurich, Switzerland, Sep. 2014, pp. 740–755.
[11] B. Dwyer, J. Nelson, T. Hansen, et al., "Roboflow (Version 1.0)," Roboflow, 2024. [Online]. Available: https://roboflow.com
[12] S. Ramírez, "FastAPI," 2018. [Online]. Available: https://fastapi.tiangolo.com
[13] Vercel, Inc., "Next.js: The React framework for the web," 2024. [Online]. Available: https://nextjs.org
[14] R. Hartley and A. Zisserman, Multiple View Geometry in Computer Vision, 2nd ed. Cambridge, U.K.: Cambridge Univ. Press, 2004.
[15] K. Bernardin and R. Stiefelhagen, "Evaluating multiple object tracking performance: The CLEAR MOT metrics," EURASIP J. Image Video Process., vol. 2008, pp. 1–10, May 2008.
[16] E. Ristani, F. Solera, R. Zou, R. Cucchiara, and C. Tomasi, "Performance measures and a data set for multi-target, multi-camera tracking," in Proc. Eur. Conf. Comput. Vis. (ECCV) Workshops, Amsterdam, The Netherlands, Oct. 2016, pp. 17–35.
[17] Supabase, Inc., "Supabase: The open-source Firebase alternative," 2024. [Online]. Available: https://supabase.com
[18] Groq, Inc., "Groq API documentation," 2024. [Online]. Available: https://groq.com
[19] F. V. Webster, "Traffic signal settings," Road Research Technical Paper No. 39, Her Majesty's Stationery Office, London, U.K., 1958.
[20] P. Koonce et al., "Traffic signal timing manual," Federal Highway Administration, Washington, DC, USA, Rep. FHWA-HOP-08-024, Jun. 2008.
[21] W. Genders and S. Rahimi, "Using a deep reinforcement learning agent for traffic signal control," arXiv preprint, arXiv:1611.01142, Nov. 2016.
[22] T. Chu, J. Wang, L. Codecà, and Z. Li, "Multi-agent deep reinforcement learning for large-scale traffic signal control," IEEE Trans. Intell. Transp. Syst., vol. 21, no. 3, pp. 1086–1095, Mar. 2020.
[23] A. Wang et al., "YOLO-World: Real-time open-vocabulary object detection," in Proc. IEEE Conf. Comput. Vis. Pattern Recognit. (CVPR), Seattle, WA, USA, Jun. 2024, pp. 16901–16911.
[24] P. Zhu et al., "Detection and tracking meet drones challenge," IEEE Trans. Pattern Anal. Mach. Intell., vol. 44, no. 11, pp. 7847–7865, Nov. 2022.
[25] A. Prakash et al., "Structured domain randomization: Bridging the reality gap by context-aware synthetic data," in Proc. IEEE Int. Conf. Robot. Autom. (ICRA), Montreal, QC, Canada, May 2019, pp. 7249–7255.
[26] R. Sochor, J. Špaňhel, and A. Herout, "BoxCars: Improving fine-grained recognition of vehicles using 3D bounding boxes in traffic surveillance," IEEE Trans. Intell. Transp. Syst., vol. 20, no. 1, pp. 97–108, Jan. 2019.
[27] R. P. Roess, E. S. Prassas, and W. R. McShane, Traffic Engineering, 4th ed. Upper Saddle River, NJ, USA: Pearson, 2011.
[28] Y. Li, C. Li, and Q. Meng, "Emergency vehicle detection from traffic surveillance video," in Proc. IEEE Int. Conf. Multimedia Expo (ICME), Chengdu, China, Jul. 2014, pp. 1–6.



 
APPENDIX A: Source Code and Repository
A.1 Repository Links
The complete source code for both subsystems is maintained in two GitHub repositories. All source code, configuration files, scenario definitions, training scripts, evaluation pipelines, and supporting documentation are available at the following locations:
Simulation and Control Repository URL: https://github.com/3bdulah/ai-traffic-management-system — SUMO microsimulation environment, TraCI subscription client, actuated and fixed-time signal control policies, FastAPI backend, WebSocket broadcasting layer, Next.js dashboard, CARLA visualization bridge, emergency vehicle preemption module, Supabase logging pipeline, race-mode experiment framework, and network generation scripts.
backend/          FastAPI application — routers, services, WebSocket manager
frontend/         Next.js dashboard — components, hooks, Zustand store
packages/
  adaptive-policy/    Signal control policies (actuated and fixed-time)
  carla-bridge/       CARLA client, traffic manager, camera sensors
  cv-pipeline/        Computer vision pipeline integration layer
  shared/             Shared Pydantic models, constants, configuration
  sumo-engine/        TraCI client, snapshot extraction, network config
scripts/          Network and demand generation, race evaluation runner
supabase/         Database migrations and schema definitions
Computer Vision Repository URL: https://github.com/OJayyusiO/dataset_capstone (public) Contents: CARLA scenario configurations, dataset capture scripts, model training and evaluation pipelines, ByteTrack integration, and the full traffic analytics layer including speed estimation, queue counting, violation detection, and collision detection.
capture/          Dataset capture scripts and frame labeling pipeline
setup/            Scenario configuration and analytics calibration tools
train.py          YOLOv11 training entry point
evaluate/         Model evaluation, tracking metrics, report generation
analytics/        Speed estimation, queue counting, violation detection
configs/          Scenario YAML files and analytics configuration files
utils/            Shared constants, bounding box projection, CARLA helpers
A PROJECT_HISTORY.md document within the computer vision repository provides a chronological record of every significant design decision and technical challenge encountered during the project.
 
APPENDIX B: User Manual / Installation Guide
B.1 Overview
The system runs as three processes: a CARLA server, the FastAPI backend, and the Next.js dashboard. The computer-vision overlay is available in CARLA mode and is disabled by default. This guide covers installation, launching the system, and verifying the vision integration.
B.2 Prerequisites
A running CARLA 0.9.16 server on localhost:2000 and an NVIDIA GPU are required. The trained model weights (best.pt) are committed in the repository under packages/cv-pipeline/models/, so no separate download is needed. A Python 3.12 environment is used to match the CARLA Python wheel.
B.3 Installation
Create the environment and install the workspace packages and dependencies:
conda create -n traffic python=3.12 -y
conda activate traffic
python -m pip install torch --index-url https://download.pytorch.org/whl/cu121
python -m pip install -e packages/shared -e packages/sumo-engine -e packages/adaptive-policy -e packages/cv-pipeline -e packages/carla-bridge -e backend
python -m pip install ultralytics
python -m pip install <CARLA>/PythonAPI/carla/dist/carla-0.9.16-cp312-cp312-win_amd64.whl
cd frontend ; npm install ; cd ..
B.4 Running the System
Start the CARLA server (CarlaUE4) on localhost:2000, then launch the backend and the dashboard in separate terminals:
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
cd frontend ; npm run dev
Open http://localhost:3000, and in the simulation controls select mode = CARLA and start the run.
B.5 Using the Vision Integration
Click an intersection on the map, open the Cameras tab, and select an approach (N, E, S, or W) to view its live feed. Click “Vision: on” to run the YOLOv11m model on that camera: the feed is annotated with bounding boxes, class labels, emergency vehicles, and per-vehicle speed, and that intersection’s queue and emergency state on the map are sourced from the vision pipeline while every other intersection remains on simulator ground truth. Click “Edit regions” to draw lane polygons and red-light violation lines directly on the feed; these are stored per camera and consumed by the analytics layer. Toggling vision off returns the dashboard to the simulator’s ground truth.
B.6 Computer-Vision Pipeline (Dataset, Training, and Analytics)
The computer-vision pipeline — dataset generation, model training, evaluation, and the standalone analytics tools — lives in the dataset_capstone repository (https://github.com/OJayyusiO/dataset_capstone) and runs against a local CARLA 0.9.16 server.
Installation
conda create -n capstone python=3.12 -y
conda activate capstone
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install ultralytics opencv-python pyyaml
pip install <CARLA>/PythonAPI/carla/dist/carla-0.9.16-cp312-cp312-win_amd64.whl
Generating the dataset
With CARLA running, configure a capture scenario and run the capture; class balance is checked automatically after each session:
python capstone_sim/scripts/capture/setup_scenario.py
python capstone_sim/scripts/capture/capture_dataset.py <scenario>.yaml
Training and evaluation
python capstone_sim/scripts/train/train.py
python capstone_sim/scripts/evaluate/evaluate_model.py <recording> capstone_sim/models/yolov11m/best.pt
Running analytics on a recording or video
Calibrate the camera (automatic for CARLA recordings, interactive 4-point for real video) and run the analytics, which writes an annotated video plus per-track, per-lane queue, and violation CSV files and a summary JSON:
python capstone_sim/scripts/analytics/setup_analytics.py <source>
python capstone_sim/scripts/analytics/traffic_analytics.py <source> capstone_sim/models/yolov11m/best.pt
 
APPENDIX C: Test Data and Additional Results
[Include detailed test data, raw results, extended performance metrics, and any supplementary analysis that supports the findings in the main body.]
 
 
 
 

 
 
APPENDIX D: Meeting Minutes and Project Logs
D.1 Communication Channels
The team relied on the following channels for ongoing coordination throughout the project:
Channel	Purpose	Frequency
WhatsApp / Discord	Day-to-day asynchronous communication, quick clarifications, scheduling	Daily
GitHub (issues, pull requests, code review)	Code coordination, design discussions tied to specific changes	As needed
In-person / video meetings	Weekly synchronization, design reviews, integration planning	Weekly
Email	Formal communication with supervisors and faculty	As needed
Shared documents (docs/api_spec.md, PROJECT_HISTORY.md)	Design notes, API specifications, meeting minutes, decision log	Continuous
D.2 Recurring Meetings
The team maintained the following recurring meetings throughout the project lifecycle:
Meeting	Participants	Frequency	Purpose
Sub-team stand-up (simulation and control)	Alkhozendar, Salamoun, Al-Shobaki	Weekly	Progress updates, blocker resolution, task allocation
Sub-team stand-up (computer vision)	Al-Labani, Dribika, Jayyusi	Weekly	Progress updates, blocker resolution, task allocation
Cross-team integration meeting	All team members	Bi-weekly	Interface alignment, integration planning, demo coordination
Supervisor meeting	All team members + Prof. Murat Göksin	Bi-weekly	Progress review, feedback, course correction
D.3 Key Meetings and Decisions Log
The following table summarizes the key meetings and decisions made throughout the project that had a material effect on system design, methodology, or scope.
Date	Participants	Topic	Decision / Outcome
Sep 2025	Full team + advisors	Project kickoff and scope definition	Final project scope agreed: SUMO simulation, adaptive signal control, computer vision pipeline, unified dashboard
Oct 2025	Full team	Network design review	3×2 arterial grid of six intersections confirmed; three demand profiles defined
Nov 2025	Full team	TraCI integration review	Subscription-driven state extraction adopted over per-vehicle polling for performance
Dec 2025	Full team	Signal policy design review	Actuated leftover-queue redistribution policy design finalized; fixed-time baseline interface confirmed
Jan 2026	CV sub-team	Pre-trained model evaluation review	YOLOv12, VideoMT, and YOLOE all rejected; decision made to train custom YOLOv11 model
Feb 2026	Full team	Data strategy pivot	Real-world dataset abandoned due to domain mismatch; CARLA synthetic dataset pipeline adopted
Feb 2026	Full team	Scope extension review	CARLA visualization bridge and emergency vehicle preemption module approved as scope additions
Mar 2026	CV sub-team	Dataset imbalance review	Spawn ratios rebalanced after bus recall found at 7.9%; police car and bus counts doubled
Mar 2026	Simulation sub-team	WebSocket performance review	Default vehicle count reduced to 5,500; lightweight race-tick extraction adopted for race mode
Apr 2026	Full team	Integration planning	TickData schema locked as shared contract; co-commit convention established for Pydantic/TypeScript sync
Apr 2026	Full team	First race-mode results review	40–54% clearance time reduction confirmed across all three demand profiles; B0/B1 chokepoint identified
Apr 2026	Simulation sub-team	Groq AI assistant review	Groq-powered chatbot approved as dashboard addition; Groq free tier confirmed sufficient
May 2026	Full team + Prof. Murat Göksin	Formal advisory meeting	Prof. Göksin advised prioritizing MVP before finer-grained classification; guidance incorporated into spring term plan
May 18, 2026	Full team + Prof. Murat Göksin + Prof. Fatih Kahraman	Mid-term progress presentation	Both subsystems demonstrated live; actuated policy results and YOLOv11 evaluation metrics presented; advisors confirmed project on track for spring term deadline
May 2026	CV sub-team	Final training review	YOLOv11m trained on vast.ai NVIDIA L40S; mAP50 = 0.949 confirmed; model approved for integration
May 2026	Full team	CV integration planning	CV pipeline integration into live tick loop scoped and assigned; asyncio decoupling approach agreed
Jun 2026	Full team	Final integration review	Full end-to-end system validated; chevron violation detection, highway entry counting, and collision detection confirmed complete
Jun 2026	Full team	Demo preparation	Launch scripts finalized; demonstration walkthrough rehearsed; final report writing commenced
D.4 Advisor Feedback Log
Date	Advisor	Feedback	Action Taken
May 13, 2026	Prof. Murat Göksin	Advised reducing target class count to establish a minimum viable product before attempting fine-grained emergency vehicle classification, given the difficulty encountered with real-world training data	Team accepted guidance; pivoted to CARLA synthetic data pipeline with full seven-class support rather than reducing classes, achieving the MVP target while retaining fine-grained classification through synthetic data control
D.5 Risk Log
The following table records the risks that materialized during the project and the mitigations applied, supplementing the risk assessment presented in the progress report.
Risk	Date Materialized	Impact	Mitigation Applied	Outcome
Insufficient real-world traffic data	Feb 2026	High	Switched to CARLA synthetic dataset pipeline	Fully resolved; model exceeded accuracy targets
Insufficient model accuracy on rare classes	Mar 2026	Medium	Rebalanced spawn ratios; retrained model	Bus recall recovered from 7.9% to 96%
Hardware limitations for training	Mar 2026	Medium	Migrated to vast.ai cloud GPU rental	Training completed in 3 hours at $2.50 USD
CARLA GPU instability on Town03	Apr 2026	Medium	Pivoted to Town10HD	No functional loss
TraCI race-mode second-run failure	Apr 2026	Medium	Enforced strict teardown sequence in SimulationManager	All six races complete reliably
TypeScript/Python type drift	Apr 2026	Low	Co-commit convention and shared API specification established	No further drift for remainder of project
Supabase write performance under tick load	May 2026	High	Switched to batched asynchronous bulk inserts	Tick loop no longer blocked by database writes
CV pipeline integration latency	Jun 2026	Medium	CV pipeline decoupled into separate asyncio process	Integration completed without tick loop performance impact
________________________________________

 
APPENDIX E: Poster / Presentation Slides
[Include the project poster and/or final presentation slides.]

































