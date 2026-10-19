<?php
declare(strict_types=1);
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
function respond(bool $ok, string $message, int $status = 200, array $extra = []): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => $ok, 'message' => $message] + $extra, JSON_UNESCAPED_UNICODE);
    exit;
}
function validRecord(mixed $record): bool {
    return is_array($record) && isset($record['id'], $record['candidate'], $record['review_state'],
        $record['revision'], $record['submitted_at'], $record['profile'])
        && is_string($record['id']) && preg_match('/\AKS-26-[A-F0-9]{12}\z/', $record['id'])
        && $record['candidate'] === 'nagisa' && is_int($record['revision']) && $record['revision'] > 0
        && is_string($record['submitted_at']) && is_array($record['profile'])
        && array_key_exists('reviewed_by', $record) && array_key_exists('reviewed_at', $record)
        && (($record['review_state'] === 'pending' && $record['reviewed_by'] === null && $record['reviewed_at'] === null)
            || ($record['review_state'] === 'approved' && is_string($record['reviewed_by']) && is_string($record['reviewed_at'])));
}
function applicationRecord(callable $change): ?array {
    $path = getenv('APPLICATION_STATE_FILE') ?: sys_get_temp_dir() . '/kosaka-application-v2.json';
    $file = @fopen($path, 'c+b');
    if ($file === false || !flock($file, LOCK_EX)) respond(false, '受理服务暂时不可用。', 503);
    try {
        rewind($file);
        $text = stream_get_contents($file, 16385);
        $current = is_string($text) && $text !== '' ? json_decode($text, true) : null;
        if ($text === false || strlen($text) > 16384 || ($text !== '' && !validRecord($current))) {
            respond(false, '申请记录暂时无法读取。', 503);
        }
        $next = $change($current);
        if ($next !== $current) {
            $encoded = json_encode($next, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            rewind($file);
            if (!ftruncate($file, 0) || fwrite($file, $encoded) !== strlen($encoded) || !fflush($file)) {
                respond(false, '申请记录暂时无法保存。', 503);
            }
        }
        return $next;
    } finally {
        flock($file, LOCK_UN);
        fclose($file);
    }
}
function receipt(?array $record): array {
    if ($record === null) return ['state' => 'none'];
    return [
        'id' => $record['id'], 'candidate' => $record['candidate'],
        'state' => $record['review_state'], 'revision' => $record['revision'],
        'submitted_at' => $record['submitted_at'], 'reviewed_by' => $record['reviewed_by'],
        'reviewed_at' => $record['reviewed_at'], 'profile' => $record['profile']
    ];
}
function admissionCredential(): string {
    $contents = @file_get_contents(getenv('FLAG_FILE') ?: '/run/flag.txt');
    if ($contents !== false) $contents = preg_replace('/\A\xEF\xBB\xBF/', '', $contents);
    if ($contents === false || !preg_match('/\ATrinity\{[A-Za-z0-9_]+\}\z/', trim($contents))) {
        respond(false, '录取回执暂时无法生成。', 503);
    }
    return trim($contents);
}
$student = ['account' => 'nagisa', 'name' => '渚'];
$reviewers = [
    'sunohara' => ['name' => '春原', 'role' => 'intake', 'password_md5' => 'aafdc23870ecbcd3d557b6423a898213'],
    'club_lead' => ['name' => 'CTF 部负责人', 'role' => 'review', 'password_md5' => '0e131973330492438352903207680766']
];
$route = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!in_array($route, ['/', '/index.php'], true)) respond(false, '页面不存在。', 404);
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD', 'POST'], true)) {
    header('Allow: GET, HEAD, POST');
    respond(false, '不支持的请求方式。', 405);
}
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 4096) respond(false, '申请单太长。', 413);
    $application = $_POST['application'] ?? '';
    if (!is_string($application) || $application === '' || strlen($application) > 2048) {
        respond(false, '申请数据格式不正确。', 400);
    }
    // 学生入口不接收工作台审核字段。
    $workbenchFields = ['review_state', 'review_by', 'review_code'];
    $entries = explode('&', $application);
    if (count($entries) > 64) respond(false, '申请字段太多。', 400);
    foreach ($entries as $entry) {
        $name = urldecode(explode('=', $entry, 2)[0]);
        if (str_contains($name, "\0") || substr_count($name, '[') > 4
            || in_array(explode('[', $name, 2)[0], $workbenchFields, true)) {
            respond(false, '申请字段不符合要求。', 400);
        }
    }
    // 旧受理接口同时支持申请资料更新与工作台审核回写。
    parse_str($application, $fields);
    $candidate = $fields['candidate'] ?? '';
    $applicationId = $fields['application_id'] ?? '';
    if (!is_string($candidate) || $candidate !== $student['account'] || !is_string($applicationId)
        || ($applicationId !== '' && !preg_match('/\AKS-26-[A-F0-9]{12}\z/', $applicationId))) {
        respond(false, '申请人或申请编号不正确。', 400);
    }
    if (array_intersect($workbenchFields, array_keys($fields))) {
        $state = $fields['review_state'] ?? '';
        $by = $fields['review_by'] ?? '';
        $code = $fields['review_code'] ?? '';
        if ($state !== 'approved' || !is_string($by) || !is_string($code) || strlen($code) > 64) {
            respond(false, '审核记录格式不正确。', 400);
        }
        $reviewer = $reviewers[$by] ?? null;
        if ($reviewer === null || $reviewer['role'] !== 'review'
            || md5($code) != $reviewer['password_md5']) {
            respond(false, '审核签署信息无法确认。', 403);
        }
        $record = applicationRecord(function (?array $current) use ($applicationId, $candidate, $reviewer): array {
            if ($current === null || $current['id'] !== $applicationId || $current['candidate'] !== $candidate) {
                respond(false, '未找到对应申请，请先递交申请。', 409);
            }
            $current['review_state'] = 'approved';
            $current['reviewed_by'] = $reviewer['name'];
            $current['reviewed_at'] = gmdate('Y-m-d\TH:i:s\Z');
            return $current;
        });
        respond(true, '审核结果已登记，可以查看录取回执。', 200, ['application' => receipt($record)]);
    }
    $class = $fields['class_name'] ?? '';
    $interest = $fields['interest'] ?? '';
    $experience = $fields['experience'] ?? 'new';
    $reason = $fields['reason'] ?? '';
    $contact = $fields['contact'] ?? '';
    $availability = $fields['availability'] ?? [];
    if (!is_string($class) || !preg_match('/\A[1-3]-[A-C]\z/', $class)
        || !in_array($interest, ['web', 'crypto', 'reverse', 'exploring'], true)
        || !in_array($experience, ['new', 'practice', 'contest'], true)
        || !is_string($reason) || !preg_match('/\A.{1,120}\z/us', $reason) || trim($reason) === ''
        || !is_string($contact) || !preg_match('/\A.{0,32}\z/us', $contact)
        || ($fields['agreement'] ?? '') !== 'yes' || !is_array($availability) || count($availability) > 3) {
        respond(false, '请完整填写班级、兴趣方向、申请理由，并确认社团约定。', 400);
    }
    foreach ($availability as $time) {
        if (!in_array($time, ['wednesday', 'friday', 'weekend'], true)) respond(false, '活动时间填写不正确。', 400);
    }
    $profile = ['name' => $student['name'], 'class_name' => $class, 'interest' => $interest,
        'experience' => $experience, 'reason' => $reason, 'contact' => $contact, 'availability' => array_values($availability)];
    $record = applicationRecord(function (?array $current) use ($applicationId, $candidate, $profile): array {
        if (($current === null && $applicationId !== '') || ($current !== null && $current['id'] !== $applicationId)) {
            respond(false, '申请编号已更新，请刷新申请进度后重新递交。', 409);
        }
        return ['id' => $current['id'] ?? 'KS-26-' . strtoupper(bin2hex(random_bytes(6))),
            'candidate' => $candidate, 'profile' => $profile, 'revision' => ($current['revision'] ?? 0) + 1,
            'submitted_at' => gmdate('Y-m-d\TH:i:s\Z'), 'review_state' => 'pending',
            'reviewed_by' => null, 'reviewed_at' => null];
    });
    respond(true, '申请已送达 CTF 部，正在等待社团审核。修改资料后重新递交，将再次进入待审核状态。',
        200, ['application' => receipt($record)]);
}
if (isset($_GET['receipt'])) {
    $record = applicationRecord(fn (?array $current): ?array => $current);
    $extra = ['application' => receipt($record)];
    if ($record !== null && $record['review_state'] === 'approved') {
        $extra['credential'] = admissionCredential();
        respond(true, '欢迎加入 CTF 部！请保存入部凭证，第一次活动时向负责同学出示。', 200, $extra);
    }
    respond(true, $record === null ? '你还没有递交入部申请。' : '申请已受理，社团正在审核中，请留意后续通知。', 200, $extra);
}
header('Cache-Control: no-store');
header('Content-Type: text/html; charset=utf-8');
