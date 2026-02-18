<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

/* Harden: sempre JSON em caso de erros */
ini_set('display_errors', '0');
ini_set('log_errors', '1');
set_error_handler(function($errno, $errstr, $errfile, $errline){
  http_response_code(500);
  echo json_encode([
    'error' => 'PHP_ERROR',
    'message' => $errstr,
    'file' => basename($errfile),
    'line' => $errline
  ], JSON_UNESCAPED_UNICODE);
  exit;
});
set_exception_handler(function($ex){
  http_response_code(500);
  echo json_encode([
    'error' => 'PHP_EXCEPTION',
    'message' => $ex->getMessage()
  ], JSON_UNESCAPED_UNICODE);
  exit;
});

$action = $_GET['action'] ?? 'get_all';
$baseDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR;
$files = [
  'packages' => $baseDir . 'packages.json',
  'vehicles' => $baseDir . 'vehicles.json',
  'loads'    => $baseDir . 'loads.json'
];

function ensure_dir($dir) {
  if (!is_dir($dir)) {
    if (!mkdir($dir, 0777, true) && !is_dir($dir)) {
      http_response_code(500);
      echo json_encode(['error'=>"Falha ao criar diretório: $dir"], JSON_UNESCAPED_UNICODE);
      exit;
    }
  }
}

function read_json($path) {
  if (!file_exists($path)) return [];
  $raw = file_get_contents($path);
  $data = json_decode($raw, true);
  return $data ?: [];
}

function write_json($path, $data) {
  $dir = dirname($path);
  ensure_dir($dir);

  $tmp = $path . '.tmp';
  $fp = fopen($tmp, 'wb');
  if ($fp === false) {
    http_response_code(500);
    echo json_encode(['error'=>"Falha ao abrir arquivo temporário: $tmp"], JSON_UNESCAPED_UNICODE);
    exit;
  }

  if (!flock($fp, LOCK_EX)) {
    fclose($fp);
    http_response_code(500);
    echo json_encode(['error'=>"Falha no lock do arquivo: $tmp"], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $bytes = fwrite($fp, json_encode($data, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
  fflush($fp);
  flock($fp, LOCK_UN);
  fclose($fp);

  if ($bytes === false) {
    http_response_code(500);
    echo json_encode(['error'=>"Falha ao escrever no arquivo temporário: $tmp"], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // Windows: às vezes rename falha se o destino existir. Tenta unlink+rename.
  if (!@rename($tmp, $path)) {
    @unlink($path);
    if (!@rename($tmp, $path)) {
      http_response_code(500);
      echo json_encode(['error'=>"Falha ao gravar arquivo final: $path"], JSON_UNESCAPED_UNICODE);
      exit;
    }
  }
}

function uuid() { return 'id_' . bin2hex(random_bytes(8)); }

switch ($action) {
  case 'get_all': {
    $packages = read_json($files['packages']);
    $vehicles = read_json($files['vehicles']);
    $loads = read_json($files['loads']);
    echo json_encode([ 'packages'=>$packages, 'vehicles'=>$vehicles, 'loads'=>$loads ]);
    break;
  }
  case 'add_package': {
    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $pkg = [
      'id' => uuid(),
      'nome' => $in['nome'] ?? 'Sem nome',
      'peso_unitario' => floatval($in['peso_unitario'] ?? 0),
      'largura' => floatval($in['largura'] ?? 0),
      'altura' => floatval($in['altura'] ?? 0),
      'comprimento' => floatval($in['comprimento'] ?? 0),
      'empilhavel' => !!($in['empilhavel'] ?? true),
      'rotacionar' => !!($in['rotacionar'] ?? true),
    ];
    $list = read_json($files['packages']); $list[] = $pkg; write_json($files['packages'], $list);
    echo json_encode(['ok'=>true, 'pkg'=>$pkg]);
    break;
  }
  case 'delete_package': {
    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $id = $in['id'] ?? '';
    $list = read_json($files['packages']);
    $list = array_values(array_filter($list, fn($p)=>$p['id'] !== $id));
    write_json($files['packages'], $list);
    echo json_encode(['ok'=>true]);
    break;
  }
  case 'add_vehicle': {
    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $veh = [
      'id' => uuid(),
      'nome' => $in['nome'] ?? 'Veículo',
      'interno' => [
        'largura' => floatval($in['largura'] ?? 0),
        'altura' => floatval($in['altura'] ?? 0),
        'comprimento' => floatval($in['comprimento'] ?? 0),
      ],
      'peso_max_t' => floatval($in['peso_max_t'] ?? 0)
    ];
    $list = read_json($files['vehicles']); $list[] = $veh; write_json($files['vehicles'], $list);
    echo json_encode(['ok'=>true, 'vehicle'=>$veh]);
    break;
  }
  case 'delete_vehicle': {
    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $id = $in['id'] ?? '';
    $list = read_json($files['vehicles']);
    $list = array_values(array_filter($list, fn($v)=>$v['id'] !== $id));
    write_json($files['vehicles'], $list);
    echo json_encode(['ok'=>true]);
    break;
  }
  case 'update_vehicle': {
    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $id = $in['id'] ?? '';
    $list = read_json($files['vehicles']);
    foreach ($list as &$v) {
      if ($v['id'] === $id) {
        $v['nome'] = $in['nome'] ?? $v['nome'];
        $v['interno']['largura'] = isset($in['largura']) ? floatval($in['largura']) : $v['interno']['largura'];
        $v['interno']['altura'] = isset($in['altura']) ? floatval($in['altura']) : $v['interno']['altura'];
        $v['interno']['comprimento'] = isset($in['comprimento']) ? floatval($in['comprimento']) : $v['interno']['comprimento'];
        $v['peso_max_t'] = isset($in['peso_max_t']) ? floatval($in['peso_max_t']) : $v['peso_max_t'];
      }
    }
    write_json($files['vehicles'], $list);
    echo json_encode(['ok'=>true]);
    break;
  }
  case 'save_load': {
    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $rec = [
      'id' => uuid(),
      'name' => $in['name'] ?? ('Carga ' . date('c')),
      'vehicleId' => $in['vehicleId'] ?? null,
      'items' => $in['items'] ?? [],
      'ts' => date('c')
    ];
    $list = read_json($files['loads']); $list[] = $rec; write_json($files['loads'], $list);
    echo json_encode(['ok'=>true, 'load'=>$rec]);
    break;
  }
  case 'list_loads': {
    $list = read_json($files['loads']);
    echo json_encode(['loads'=>$list]);
    break;
  }
  case 'delete_load': {
    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $id = $in['id'] ?? '';
    $list = read_json($files['loads']);
    $list = array_values(array_filter($list, fn($v)=>$v['id'] !== $id));
    write_json($files['loads'], $list);
    echo json_encode(['ok'=>true]);
    break;
  }
  default: {
    http_response_code(400);
    echo json_encode([ 'error' => 'Ação desconhecida: ' . $action ]);
  }
}